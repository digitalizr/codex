#!/usr/bin/env python3
"""Real-browser household workflow using an isolated SQLite database.

Run: python tests/ui_smoke.py
Requires Python playwright and Chromium at /usr/bin/chromium (or CHROMIUM_PATH).
The script starts its own development server at PORT=3011, closes it afterward,
and never writes to the application's regular household database.
"""

import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright, expect


ROOT = Path(__file__).resolve().parents[1]
PORT = 3011
ORIGIN = f"http://127.0.0.1:{PORT}"


def state():
    with urllib.request.urlopen(f"{ORIGIN}/api/state", timeout=5) as response:
        return json.load(response)


def ready(process):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise AssertionError(f"Isolated server exited with {process.returncode}")
        try:
            with urllib.request.urlopen(f"{ORIGIN}/api/health", timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            pass
        time.sleep(0.1)
    raise AssertionError("Isolated development server did not become ready")


def start_server(db_path, log):
    # Refuse to attach to an unrelated application already using the test port.
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind(("127.0.0.1", PORT))
    environment = {**os.environ, "PORT": str(PORT), "NODE_ENV": "development", "GROCERY_DB_PATH": str(db_path)}
    process = subprocess.Popen(["node", "server/index.mjs"], cwd=ROOT, env=environment, stdout=log, stderr=log)
    ready(process)
    return process


def stop_server(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=7)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)


def nav(page, name):
    if page.viewport_size["width"] < 800:
        page.get_by_role("button", name="Open navigation", exact=True).click()
    page.locator(".sidebar").get_by_role("button", name=re.compile(r"^" + re.escape(name) + r"(?: \d+)?$")).click()


def no_overflow(page, description):
    measured = page.evaluate("({width:innerWidth, scroll:document.documentElement.scrollWidth})")
    assert measured["scroll"] <= measured["width"] + 1, f"{description} overflows horizontally: {measured}"


def dialog(page, name):
    value = page.get_by_role("dialog", name=name, exact=True)
    expect(value).to_be_visible()
    return value


def submit(modal, button):
    modal.get_by_role("button", name=button, exact=True).click()
    expect(modal).not_to_be_visible()


def stock_card(page, name):
    value = page.locator("article.inventory-item").filter(has=page.get_by_role("heading", name=name, exact=True))
    expect(value).to_be_visible()
    return value


def add_registry(page, tab, add_button, modal_name, field, name):
    page.get_by_role("navigation", name="Settings sections").get_by_role("button", name=tab, exact=True).click()
    page.get_by_role("button", name=add_button, exact=True).click()
    modal = dialog(page, modal_name)
    modal.get_by_label(field, exact=True).fill(name)
    assert modal.evaluate("element => element.contains(document.activeElement)"), "Modal focus must stay inside"
    submit(modal, add_button.replace("a ", ""))
    expect(page.locator(".settings-row").filter(has_text=name)).to_be_visible()


def run():
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="hearth-ui-") as directory:
        db_path = Path(directory) / "isolated.sqlite"
        with (Path(directory) / "server.log").open("w+") as log:
            process = start_server(db_path, log)
            errors = []
            try:
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), headless=True, args=["--no-sandbox"])
                    context = browser.new_context(viewport={"width": 1440, "height": 1000}, timezone_id="Europe/Berlin")
                    page = context.new_page()
                    page.set_default_timeout(8000)
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.on("response", lambda response: errors.append(f"HTTP {response.status}: {response.url}") if response.status >= 500 else None)
                    page.goto(ORIGIN)
                    expect(page.get_by_role("heading", level=1)).to_be_visible()
                    no_overflow(page, "Desktop overview")

                    # The destructive starter reset is exercised only in this disposable database.
                    nav(page, "Household settings")
                    page.get_by_role("navigation", name="Settings sections").get_by_role("button", name="Data", exact=True).click()
                    page.get_by_role("button", name="Clear starter data", exact=True).click()
                    modal = dialog(page, "Start with your own groceries?")
                    submit(modal, "Clear starter data")
                    assert state()["household"]["demo"] is False
                    assert state()["inventory"] == []

                    add_registry(page, "Locations", "Add a location", "Add a location", "Location name", "Breakfast shelf")
                    add_registry(page, "Categories", "Add a category", "Add a category", "Category name", "Breakfast essentials")
                    add_registry(page, "Stores", "Add a store", "Add a store", "Store name", "Local bakery")
                    add_registry(page, "Household", "Add a profile", "Add a profile", "Name", "Wife")
                    page.get_by_label("Active household member", exact=True).select_option(label="Wife")

                    # Complete a labeled inventory form, including a fractional quantity and expiry.
                    nav(page, "My inventory")
                    page.get_by_role("button", name="Add an item", exact=True).click()
                    modal = dialog(page, "Add an item")
                    expect(modal.get_by_label("Item name", exact=True)).to_be_focused()
                    modal.get_by_label("Item name", exact=True).fill("Morning oats")
                    modal.get_by_label("Category", exact=True).select_option(label="🏷️ Breakfast essentials")
                    modal.get_by_label("Unit", exact=True).fill("kg")
                    modal.get_by_label("Keep at least", exact=True).fill("2")
                    modal.get_by_label("Preferred store", exact=False).select_option(label="Local bakery")
                    modal.get_by_label("Starting quantity", exact=False).fill("1.5")
                    modal.get_by_label("Storage location", exact=True).select_option(label="📦 Breakfast shelf")
                    modal.get_by_label("Best before", exact=False).fill("2030-01-31")
                    no_overflow(page, "Desktop inventory form")
                    submit(modal, "Add to inventory")
                    card = stock_card(page, "Morning oats")
                    expect(card.locator(".inventory-stock strong")).to_have_text("1.5")
                    expect(card).to_contain_text("Breakfast shelf")
                    expect(card).to_contain_text("31 Jan")

                    card.get_by_role("button", name="Use", exact=True).click()
                    modal = dialog(page, "Use an item")
                    modal.get_by_label("Quantity used", exact=False).fill("0.25")
                    submit(modal, "Record use")
                    expect(stock_card(page, "Morning oats").locator(".inventory-stock strong")).to_have_text("1.25")
                    card = stock_card(page, "Morning oats")
                    card.get_by_role("button", name="More options for Morning oats", exact=True).click()
                    card.get_by_role("button", name="Mark as gone", exact=True).click()
                    modal = dialog(page, "Mark as gone")
                    modal.get_by_label("Quantity gone", exact=False).fill("0.25")
                    submit(modal, "Mark as gone")
                    expect(stock_card(page, "Morning oats").locator(".inventory-stock strong")).to_have_text("1")
                    assert [event["action"] for event in state()["activity"]][:2] == ["discarded", "consumed"]
                    assert all(event["memberName"] == "Wife" for event in state()["activity"])

                    # Suggestions become commitments only through the person's explicit selection.
                    nav(page, "Shopping lists")
                    page.get_by_role("checkbox", name="Select Morning oats suggestion", exact=True).check()
                    page.get_by_role("button", name=re.compile(r"^Add selected")).click()
                    modal = dialog(page, "Turn suggestions into a plan")
                    modal.get_by_label("Trip name", exact=True).fill("Saturday two-store shop")
                    modal.get_by_label("Shopping date", exact=False).fill("2030-02-02")
                    submit(modal, "Add to list")
                    expect(page.locator(".shopping-list-header")).to_contain_text("Saturday two-store shop")
                    assert not state()["suggestions"], "An active list should cover this refill"

                    page.get_by_role("button", name="Edit trip details", exact=True).click()
                    modal = dialog(page, "Trip details")
                    modal.get_by_label("Who’s shopping?", exact=True).select_option(label="Wife (you)")
                    modal.get_by_label("Notes", exact=True).fill("Visit REWE and the bakery")
                    submit(modal, "Save changes")
                    expect(page.locator(".shopping-detail").get_by_label("Trip shopper", exact=True)).to_contain_text("Wife")

                    page.get_by_role("button", name="Add an item", exact=True).click()
                    modal = dialog(page, "Add to your shopping list")
                    modal.get_by_label("Grocery item", exact=True).select_option(label="🛒 Morning oats")
                    modal.get_by_label("Quantity", exact=True).fill("0.5")
                    modal.get_by_label("Buy from", exact=True).select_option(label="REWE")
                    submit(modal, "Add item")
                    page.get_by_role("button", name="Add an item", exact=True).click()
                    modal = dialog(page, "Add to your shopping list")
                    modal.get_by_role("button", name="Something new", exact=True).click()
                    modal.get_by_label("Item name", exact=True).fill("Bakery rolls")
                    modal.get_by_label("Quantity", exact=True).fill("4")
                    modal.get_by_label("Unit", exact=True).fill("pcs")
                    modal.get_by_label("Buy from", exact=True).select_option(label="Local bakery")
                    submit(modal, "Add item")
                    expect(page.locator(".shopping-provider").get_by_role("heading", name="REWE", exact=True)).to_be_visible()
                    expect(page.locator(".shopping-provider").get_by_role("heading", name="Local bakery", exact=True)).to_be_visible()

                    # Only the REWE portion is purchased. The other stop remains not bought.
                    rewe = page.locator(".shopping-provider").filter(has=page.get_by_role("heading", name="REWE", exact=True))
                    rewe.get_by_role("checkbox", name="Mark bought Morning oats", exact=True).click()
                    expect(rewe.get_by_role("checkbox")).to_be_checked()
                    page.get_by_role("button", name=re.compile(r"^Check in groceries")).click()
                    modal = dialog(page, "Welcome home, groceries")
                    expect(modal).to_contain_text("2 unchecked items stay")
                    modal.get_by_label("Store these groceries in", exact=True).select_option(label="📦 Breakfast shelf")
                    modal.get_by_label("Best-before date", exact=False).fill("2030-02-28")
                    submit(modal, "Check in & complete")
                    expect(page.locator(".shopping-detail")).to_contain_text("Unchecked items were not bought")
                    expect(page.locator(".shopping-detail")).to_contain_text("Not bought")
                    current = state()
                    assert current["inventory"][0]["quantity"] == 1.5
                    trip = current["lists"][0]
                    assert trip["status"] == "completed"
                    assert len(trip["items"]) == 3
                    assert len([item for item in trip["items"] if item["checked"]]) == 1
                    assert not any(item["name"] == "Bakery rolls" for item in current["inventory"])

                    # Correct a particular batch without rewriting the product or other stock.
                    nav(page, "My inventory")
                    card = stock_card(page, "Morning oats")
                    card.get_by_role("button", name="More options for Morning oats", exact=True).click()
                    card.get_by_role("button", name="Edit item & stock", exact=True).click()
                    modal = dialog(page, "Edit item")
                    modal.get_by_role("button", name=re.compile(r"^Edit stock in Breakfast shelf, 1 kg")).click()
                    editor = modal.locator(".inventory-batch-editor")
                    editor.get_by_label("Correct quantity", exact=False).fill("0.75")
                    editor.get_by_label("Storage location", exact=True).select_option(label="❄️ Fridge")
                    editor.get_by_label("Best before", exact=False).fill("2030-02-07")
                    modal.get_by_role("button", name="Save stock changes", exact=True).click()
                    expect(modal.locator(".inventory-batch-editor")).not_to_be_visible()
                    expect(modal.locator(".stock-item-summary")).to_contain_text("1.25 kg at home")
                    modal.get_by_role("button", name="Close dialog", exact=True).click()
                    expect(modal).not_to_be_visible()
                    corrected = state()["inventory"][0]
                    assert corrected["quantity"] == 1.25
                    assert any(batch["quantity"] == 0.75 and batch["locationId"] == "fridge" and batch["expiresAt"] == "2030-02-07" for batch in corrected["batches"])

                    page.get_by_role("button", name="Add an item", exact=True).click()
                    modal = dialog(page, "Add an item")
                    modal.get_by_label("Item name", exact=True).fill("Accidental catalogue entry")
                    modal.get_by_label("Starting quantity", exact=False).fill("0")
                    submit(modal, "Add to inventory")
                    accidental = stock_card(page, "Accidental catalogue entry")
                    accidental.get_by_role("button", name="More options for Accidental catalogue entry", exact=True).click()
                    accidental.get_by_role("button", name="Remove item", exact=True).click()
                    modal = dialog(page, "Remove Accidental catalogue entry?")
                    submit(modal, "Remove item")
                    expect(page.get_by_role("heading", name="Accidental catalogue entry", exact=True)).not_to_be_visible()
                    assert len(state()["inventory"]) == 1

                    nav(page, "Shopping planner")
                    expect(page.get_by_role("heading", name="Your weekly planner", exact=True)).to_be_visible()
                    page.get_by_role("button", name="Next week", exact=True).click()
                    page.get_by_role("button", name="Previous week", exact=True).click()
                    page.get_by_role("button", name="Plan a shopping trip", exact=True).click()
                    modal = dialog(page, "Plan a shopping trip")
                    modal.get_by_label("Trip name", exact=True).fill("Partner pickup")
                    modal.get_by_label("Shopping date", exact=False).fill("2030-02-09")
                    modal.get_by_label("Who’s shopping?", exact=True).select_option(label="Wife (you)")
                    submit(modal, "Create trip")
                    expect(page.locator(".calendar-trip").filter(has_text="Partner pickup")).to_be_visible()
                    page.locator(".calendar-trip").filter(has_text="Partner pickup").click()
                    modal = dialog(page, "Schedule this trip")
                    modal.get_by_label("Shopping date", exact=True).fill("2030-03-09")
                    modal.get_by_label("Who’s shopping?", exact=True).select_option(label="Unassigned")
                    submit(modal, "Save to planner")
                    calendar_trip = page.locator(".calendar-trip").filter(has_text="Partner pickup")
                    expect(calendar_trip).to_be_visible()
                    expect(calendar_trip).to_contain_text("Unassigned")
                    planned = next(item for item in state()["lists"] if item["name"] == "Partner pickup")
                    assert planned["date"] == "2030-03-09"
                    assert planned["memberId"] is None
                    page.locator(".planner-next-trip").filter(has_text="Partner pickup").get_by_role("button", name="I’ll go", exact=True).click()
                    expect(calendar_trip).to_contain_text("Wife")
                    no_overflow(page, "Desktop planner")

                    # A real server restart must preserve both the stock and the planned trip.
                    stop_server(process)
                    process = start_server(db_path, log)
                    page.goto(f"{ORIGIN}/inventory")
                    expect(stock_card(page, "Morning oats").locator(".inventory-stock strong")).to_have_text("1.25")
                    assert any(item["name"] == "Partner pickup" for item in state()["lists"])

                    # Small-screen navigation, scrolling containers and keyboard modal dismissal.
                    page.set_viewport_size({"width": 390, "height": 844})
                    for name in ["Overview", "My inventory", "Shopping lists", "Shopping planner", "Kitchen activity", "Household settings"]:
                        nav(page, name)
                        expect(page.get_by_role("heading", level=1)).to_be_visible()
                        no_overflow(page, f"Mobile {name}")
                    nav(page, "My inventory")
                    page.get_by_role("button", name="Add an item", exact=True).click()
                    modal = dialog(page, "Add an item")
                    no_overflow(page, "Mobile inventory form")
                    expect(modal.get_by_label("Item name", exact=True)).to_be_focused()
                    page.keyboard.press("Shift+Tab")
                    assert modal.evaluate("element => element.contains(document.activeElement)"), "Keyboard focus escaped modal"
                    page.keyboard.press("Escape")
                    expect(modal).not_to_be_visible()
                    assert not errors, "Browser/server errors: " + "; ".join(errors)
                    browser.close()
                    print(f"PASS ({time.monotonic() - started:.1f}s): desktop and mobile household setup, stock movements, suggestions, multi-store shopping, partial check-in, batch corrections, planner, keyboard modal and restart persistence")
            except Exception:
                log.flush()
                log.seek(0)
                print(log.read()[-6000:])
                raise
            finally:
                stop_server(process)


if __name__ == "__main__":
    run()
