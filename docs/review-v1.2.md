# Hearth v1.2.0 local review

This release covers the first change request: a friendly style across the app, clear household profiles and shopping assignments, and movable calendar trips. The approved inventory design stays in place.

Keep Docker Desktop and your Windows GitHub runner running. Use **Actions → Release Local → Run workflow**, choose `main`, `linux/amd64`, and `target: laptop`. After the installation succeeds, open **http://localhost:3000** and check that the footer says **Local · 1.2.0**.

## Try these five things

1. Visit Home, Inventory, Shopping, Planner, Activity, and Household settings. Check the friendly illustrations, readable cards, and layout on your usual screen.
2. Switch between Mohan and Sunita in **Using as**. Reload the page: your selected profile should remain. Recording consumption should attribute it to that person.
3. In Shopping, switch between **All household**, **Mine**, and another person. Check that the assigned shopper on the selected trip stays clear even when you are viewing someone else's list. Switching profiles does not reassign a trip.
4. In Planner, drag a trip by its dotted handle to another day. Hold it over a week arrow to reach another week. You can also drop it in **Find them a day** to unschedule it, or use **Move date** to select any date with the keyboard.
5. Open the moved trip and check that its shopper, groceries, stores, and notes stayed together. Completed trips remain history and cannot be moved.

Your existing inventory and shopping data stay in the laptop's Docker volume. Original placeholder profiles named `You` and `Wife` become Mohan and Sunita while keeping their assignments; customized names are preserved. This is still a shared household profile selector without login passwords.

The second change request—owner permissions, a collaborative shopping backlog, duplicate purchase warnings, events, and weekly top-up planning—will follow after this review. This local release does not deploy to production.
