"use client";
import {
  Baby,
  Bed,
  Camera,
  Coffee,
  Landmark,
  MapPin,
  Mountain,
  Music,
  ShoppingBag,
  Utensils,
  Waves,
  Wine,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "map-pin": MapPin,
  utensils: Utensils,
  coffee: Coffee,
  bed: Bed,
  camera: Camera,
  landmark: Landmark,
  mountain: Mountain,
  waves: Waves,
  "shopping-bag": ShoppingBag,
  wine: Wine,
  music: Music,
  baby: Baby,
};

export function ListIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? MapPin;
  return <Icon className={className} />;
}
