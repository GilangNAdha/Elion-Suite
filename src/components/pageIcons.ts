import { BookOpen, Compass, FileText, Heart, Rocket, Star, Target, Zap, type LucideIcon } from 'lucide-react'

/** Page icon choices (shared by the inspector picker and the page tree). */
export const PAGE_ICONS = ['file-text', 'star', 'book-open', 'compass', 'target', 'zap', 'heart', 'rocket']

export const PAGE_ICON_MAP: Record<string, LucideIcon> = {
  'file-text': FileText,
  star: Star,
  'book-open': BookOpen,
  compass: Compass,
  target: Target,
  zap: Zap,
  heart: Heart,
  rocket: Rocket
}

export const pageIconFor = (icon: string): LucideIcon => PAGE_ICON_MAP[icon] ?? FileText
