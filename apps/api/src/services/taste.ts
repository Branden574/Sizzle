/**
 * Heuristic taste matching — the cold-start front-half of the Phase 4 ranking
 * design (docs/recommendation-algorithm.md). Maps a viewer's onboarding taste
 * picks to creators/recipes by keyword overlap. A learned model replaces this
 * in Phase 4; the interface (score a text blob against tastes) stays the same.
 */

/**
 * Keyword signals per onboarding taste label, matched against lowercased text
 * (a recipe's cuisine + title + hashtags). MUST cover every label in the web
 * app's `tasteDefs` (apps/web/src/data.ts) — a label without signals only
 * matches its own name and barely affects ranking.
 */
const TASTE_SIGNALS: Record<string, string[]> = {
  // ── Cuisines ──
  Japanese: ['japanese', 'miso', 'mirin', 'sake', 'tokyo', 'omelette', 'ramen', 'sushi', 'teriyaki', 'udon', 'matcha', 'katsu', 'donburi'],
  Chinese: ['chinese', 'wok', 'dumpling', 'sichuan', 'szechuan', 'fried rice', 'lo mein', 'dim sum', 'bao', 'hoisin', 'stir fry', 'stir-fry'],
  Korean: ['korean', 'gochujang', 'kimchi', 'bibimbap', 'bulgogi', 'tteokbokki', 'gochugaru'],
  Thai: ['thai', 'pad thai', 'lemongrass', 'coconut', 'thai basil', 'satay', 'tom yum', 'green curry'],
  Vietnamese: ['vietnamese', 'pho', 'banh mi', 'nuoc cham', 'lemongrass', 'fish sauce'],
  Indian: ['indian', 'chaat', 'puri', 'pani', 'tamarind', 'sev', 'curry', 'masala', 'tikka', 'biryani', 'paneer', 'dal', 'naan'],
  Italian: ['italian', 'pasta', 'pizza', 'margherita', 'calzone', 'focaccia', 'burrata', 'parmesan', 'basil', 'risotto', 'gnocchi', 'pesto', 'marinara', 'mozzarella'],
  French: ['french', 'butter', 'croissant', 'baguette', 'gratin', 'bechamel', 'beurre', 'confit', 'ratatouille'],
  Greek: ['greek', 'feta', 'tzatziki', 'gyro', 'olive', 'oregano', 'souvlaki'],
  Mediterranean: ['mediterranean', 'olive', 'burrata', 'harissa', 'saffron', 'heirloom', 'hummus', 'falafel', 'pita'],
  Mexican: ['mexican', 'taco', 'tortilla', 'salsa', 'ancho', 'al pastor', 'carnitas', 'guacamole', 'enchilada', 'quesadilla'],
  Caribbean: ['caribbean', 'jerk', 'plantain', 'jamaican', 'allspice', 'scotch bonnet', 'oxtail'],
  'Middle Eastern': ['middle eastern', 'hummus', 'falafel', 'tahini', 'shawarma', 'kebab', 'zaatar', "za'atar", 'baba ganoush'],
  'Soul food': ['soul food', 'soul', 'collard', 'cornbread', 'fried chicken', 'mac and cheese', 'gumbo', 'grits', 'okra'],
  'Southern BBQ': ['bbq', 'barbecue', 'smoked', 'brisket', 'ribs', 'pulled pork', 'grill', 'southern', 'smoker'],
  American: ['american', 'burger', 'fries', 'mac and cheese', 'wings', 'hot dog', 'meatloaf', 'cheeseburger'],
  // ── Diets & lifestyle ──
  Vegetarian: ['vegetarian', 'eggplant', 'burrata', 'toast', 'tofu', 'chickpea', 'veggie', 'paneer', 'mushroom'],
  Vegan: ['vegan', 'tofu', 'tempeh', 'plant-based', 'plant based', 'chickpea', 'lentil', 'cashew'],
  'High protein': ['protein', 'chicken', 'rib', 'beef', 'seafood', 'steak', 'egg', 'turkey', 'salmon'],
  Keto: ['keto', 'low carb', 'low-carb', 'lowcarb', 'avocado'],
  'Gluten-free': ['gluten free', 'gluten-free', 'glutenfree', 'rice flour', 'almond flour'],
  Halal: ['halal', 'kebab', 'shawarma', 'biryani', 'lamb'],
  Kosher: ['kosher', 'brisket', 'matzo', 'challah', 'latke'],
  Healthy: ['healthy', 'salad', 'bowl', 'wholesome', 'light', 'fresh', 'greens', 'nutritious', 'wholegrain'],
  // ── Meals & styles ──
  Breakfast: ['breakfast', 'pancake', 'eggs', 'omelette', 'waffle', 'brunch', 'bacon', 'oatmeal', 'granola', 'french toast'],
  Desserts: ['dessert', 'cake', 'cookie', 'sweet', 'chocolate', 'ice cream', 'pie', 'pudding', 'brownie', 'cheesecake'],
  Baking: ['bake', 'bakes', 'baker', 'cake', 'buns', 'cardamom', 'pistachio', 'butter', 'bread', 'pastry', 'dough'],
  'Street food': ['street', 'chaat', 'puri', 'taco', 'noodles', 'skewer', 'vendor'],
  'Comfort food': ['comfort', 'noodles', 'buns', 'cake', 'stew', 'casserole', 'cheesy', 'creamy'],
  Spicy: ['spicy', 'chili', 'harissa', 'heat', 'sichuan', 'chaat', 'sweat', 'hot', 'gochujang', 'jalapeno'],
  'Quick & easy': ['quick', 'easy', 'weeknight', 'fast', 'fridge', '15-min', '30-min', 'simple'],
  'Low effort': ['low effort', 'easy', 'quick', 'fridge', 'fast', 'one pot', 'one-pan', 'sheet pan', 'no cook'],
  'Meal prep': ['meal prep', 'mealprep', 'batch', 'make ahead', 'prep', 'lunchbox', 'freezer'],
  Seafood: ['seafood', 'saffron', 'fish', 'coastal', 'shrimp', 'salmon', 'prawn', 'scallop', 'crab', 'tuna'],
  'Soups & stews': ['soup', 'stew', 'broth', 'chowder', 'ramen', 'pho', 'bisque', 'chili'],
  Pasta: ['pasta', 'spaghetti', 'noodle', 'lasagna', 'ravioli', 'carbonara', 'penne', 'mac'],
  Drinks: ['drink', 'cocktail', 'smoothie', 'mocktail', 'juice', 'latte', 'matcha', 'boba'],
};

/** Returns the subset of `tastes` whose signals appear in `text`. */
export function matchTastes(text: string, tastes: string[]): string[] {
  const blob = text.toLowerCase();
  return tastes.filter((t) => (TASTE_SIGNALS[t] ?? [t.toLowerCase()]).some((kw) => blob.includes(kw)));
}

/** Match score = number of selected tastes whose signals appear in `text`. */
export function tasteScore(text: string, tastes: string[]): number {
  return matchTastes(text, tastes).length;
}
