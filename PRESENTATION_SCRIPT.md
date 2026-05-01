# FitCast Presentation Script (1-2 Minutes)

Hello everyone, this is my full-stack App **FitCast**.

The main idea is simple: instead of deciding clothes manually every day, users can save their wardrobe once and get weather-smart outfit suggestions instantly.

On the left, I add wardrobe items like tops, bottoms, footwear, and outerwear with tags such as `hot`, `cold`, `rainy`, or `breathable`.

In the middle, I enter a city and fetch live weather data. The app uses geocoding and weather APIs to get temperature, wind, and rain in real time.

On the right, I generate outfit ideas. Earlier it gave one fixed answer, but now it creates **3 different looks** with different style vibes:
- Casual Daily
- Smart Comfort
- Bold Street

The backend scores clothing items based on weather conditions and rotates picks across categories to avoid repetitive output.

From a design perspective, I focused on a modern glassmorphism UI, clean spacing, and responsive behavior across mobile and desktop.

So this project demonstrates:
- Full-stack development
- API integration
- Weather-based recommendation logic
- Responsive and polished UI/UX

The main tools and technologies I used are:
- **Node.js**: To build the backend server and API routes.
- **Vanilla JavaScript**: To handle frontend interactions and dynamic UI updates.
- **HTML5**: To structure the app screens and forms.
- **CSS3**: To design the modern responsive interface and visual effects.
- **Open-Meteo API**: To fetch live weather data like temperature, wind, and rain.
- **OpenStreetMap Nominatim API**: To convert city names into latitude and longitude.
- **Local JSON storage**: To store wardrobe data without needing a separate database.

If I had more time, I would add image upload for wardrobe, user login, and a weekly outfit planner.

Thank you.
