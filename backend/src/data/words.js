const wordCategories = {
  animals: [
    "cat", "dog", "elephant", "lion", "tiger", "monkey", "giraffe", "penguin", "rabbit", "horse",
    "dolphin", "shark", "butterfly", "snake", "turtle", "panda", "zebra", "frog", "owl", "kangaroo"
  ],
  objects: [
    "book", "phone", "computer", "table", "chair", "camera", "umbrella", "backpack", "clock", "lamp",
    "key", "bottle", "pencil", "guitar", "television", "bicycle", "balloon", "gift", "crown", "rocket"
  ],
  food: [
    "apple", "banana", "pizza", "burger", "sandwich", "ice cream", "cake", "donut", "popcorn", "watermelon",
    "cookie", "fries", "taco", "cheese", "carrot", "strawberry", "pineapple", "hot dog", "cupcake", "bread"
  ],
  places: [
    "house", "school", "beach", "mountain", "castle", "hospital", "airport", "park", "library", "restaurant",
    "museum", "stadium", "island", "farm", "city", "bridge", "campsite", "playground", "hotel", "garden"
  ],
  nature: [
    "tree", "flower", "sun", "moon", "star", "rainbow", "cloud", "rain", "snow", "volcano",
    "river", "waterfall", "forest", "rainforest", "desert", "ocean", "island", "mountain", "leaf", "sunflower"
  ],
  people: [
    "teacher", "doctor", "chef", "firefighter", "police officer", "astronaut", "superhero", "princess", "king", "queen",
    "pirate", "farmer", "scientist", "artist", "singer", "builder", "detective", "magician", "ninja", "soldier"
  ],
  fantasy: [
    "dragon", "wizard", "unicorn", "mermaid", "fairy", "castle", "princess", "knight", "monster", "robot",
    "superhero", "pirate", "treasure", "magic wand", "alien", "ghost", "vampire", "witch", "giant", "genie"
  ],
};

const allWords = [...new Set(Object.values(wordCategories).flat())];

module.exports = { wordCategories, allWords };
