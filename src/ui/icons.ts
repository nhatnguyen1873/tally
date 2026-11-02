// Icons are Lucide's path data (ISC license, https://lucide.dev), drawn by <Icon>.
// Importing only the data keeps each icon to a few dozen bytes.
import {
  BedDouble,
  Car,
  Ellipsis,
  type IconNode,
  Receipt,
  ShoppingBag,
  ShoppingBasket,
  Ticket,
  Utensils,
} from 'lucide'

import type { Category } from '../domain/model.ts'

export {
  ArrowRight,
  Check,
  ChevronLeft,
  CircleCheck,
  Download,
  HandCoins,
  List,
  Plus,
  Receipt,
  RotateCcwClock,
  Scale,
  Search,
  Settings,
  Trash,
  Undo2,
  UserPlus,
  Users,
  X,
} from 'lucide'
export type { IconNode }

export const CATEGORY_ICONS: Record<Category, IconNode> = {
  food: Utensils,
  groceries: ShoppingBasket,
  transport: Car,
  stay: BedDouble,
  activities: Ticket,
  shopping: ShoppingBag,
  bills: Receipt,
  other: Ellipsis,
}
