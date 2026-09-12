/** Starter checklists offered when a trip has none, plus the shapes users can save. */
export type ChecklistTemplate = {
  key: string;
  title: string;
  kind: "packing" | "todo" | "custom";
  items: string[];
};

export const BUILT_IN_TEMPLATES: ChecklistTemplate[] = [
  {
    key: "packing-essentials",
    title: "Packing essentials",
    kind: "packing",
    items: [
      "Passport or ID",
      "Tickets and booking confirmations",
      "Bank cards and some cash",
      "Phone charger and cable",
      "Power adapter",
      "Medication and first aid",
      "Toothbrush and toiletries",
      "Sunscreen",
      "Reusable water bottle",
      "Headphones",
    ],
  },
  {
    key: "before-you-go",
    title: "Before you go",
    kind: "todo",
    items: [
      "Check passport expiry",
      "Check visa requirements",
      "Travel insurance",
      "Tell the bank you're travelling",
      "Download offline maps",
      "Book airport transfer",
      "Arrange pet or plant care",
      "Set an out-of-office",
    ],
  },
  {
    key: "beach-trip",
    title: "Beach trip",
    kind: "packing",
    items: [
      "Swimwear",
      "Beach towel",
      "Flip flops",
      "Hat and sunglasses",
      "After-sun",
      "Dry bag",
      "Snorkel gear",
    ],
  },
  {
    key: "cold-weather",
    title: "Cold weather",
    kind: "packing",
    items: [
      "Warm coat",
      "Thermal layers",
      "Gloves and hat",
      "Waterproof boots",
      "Lip balm",
      "Hand warmers",
    ],
  },
  {
    key: "with-kids",
    title: "Travelling with kids",
    kind: "packing",
    items: [
      "Snacks",
      "Favourite toy",
      "Spare clothes",
      "Wipes and nappies",
      "Tablet and headphones",
      "Pram or carrier",
      "Kids' medication",
    ],
  },
  {
    key: "road-trip",
    title: "Road trip",
    kind: "todo",
    items: [
      "Driving licence",
      "Car documents and insurance",
      "Check tyres and oil",
      "Offline playlist",
      "Snacks and water",
      "Phone mount",
      "Toll pass or change",
    ],
  },
];

export function findTemplate(key: string): ChecklistTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.key === key);
}
