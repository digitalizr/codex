export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
}
export interface Location {
  id: string;
  name: string;
  emoji: string;
}
export interface Member {
  id: string;
  name: string;
  color: string;
}
export interface Provider {
  id: string;
  name: string;
  color: string;
  notes: string;
}
export interface Product {
  id: string;
  name: string;
  emoji: string;
  categoryId: string;
  unit: string;
  minQuantity: number;
  preferredProviderId: string | null;
}
export interface Batch {
  id: string;
  productId: string;
  locationId: string;
  quantity: number;
  expiresAt: string | null;
  addedAt: string;
}
export interface InventoryItem extends Product {
  quantity: number;
  batches: Batch[];
  status: 'good' | 'low' | 'out';
  expiresAt: string | null;
}
export interface ShoppingItem {
  id: string;
  listId: string;
  productId: string | null;
  name: string;
  emoji: string;
  quantity: number;
  unit: string;
  providerId: string | null;
  checked: boolean;
}
export interface ShoppingList {
  id: string;
  name: string;
  date: string | null;
  memberId: string | null;
  status: 'planned' | 'shopping' | 'completed';
  notes: string;
  createdAt: string;
  items: ShoppingItem[];
}
export interface Activity {
  id: string;
  productId: string | null;
  productName: string;
  emoji: string;
  action: 'added' | 'consumed' | 'discarded' | 'adjusted' | 'purchased';
  quantity: number;
  unit: string;
  memberName: string;
  locationName: string;
  createdAt: string;
}
export interface Suggestion {
  productId: string;
  name: string;
  emoji: string;
  categoryId: string;
  quantity: number;
  unit: string;
  reason: 'out' | 'low';
  currentQuantity: number;
  minQuantity: number;
  preferredProviderId: string | null;
}
export interface HouseholdState {
  household: { id: string; name: string; demo: boolean };
  members: Member[];
  categories: Category[];
  locations: Location[];
  providers: Provider[];
  inventory: InventoryItem[];
  lists: ShoppingList[];
  activity: Activity[];
  suggestions: Suggestion[];
}
export type Page = 'overview' | 'inventory' | 'shopping' | 'planner' | 'activity' | 'settings';
export interface PageProps {
  state: HouseholdState;
  refresh: () => Promise<void>;
  notify: (message: string, kind?: 'success' | 'error') => void;
  memberId: string;
}
