
# WatAbility

WatAbility is an interactive campus navigation web application designed to explore accessibility-aware pedestrian routing at the University of Waterloo.

## Features

- Interactive campus map with building markers
- Automatic walking routes between campus buildings
- Stair-avoidance routing preference
- Alternative routes displayed as interactive coloured lines
- Walking distance and estimated travel time
- Expandable accessibility information
- Pathway editor for drawing and saving paths
- Fullscreen and recenter map controls
- Responsive website design

## Technologies Used

- React
- TypeScript
- Vite
- MapLibre GL JS
- OpenStreetMap
- Valhalla Routing API
- HTML and CSS

## How It Works

Users select a starting building and destination. WatAbility requests pedestrian routes from the Valhalla routing service and displays the returned routes on an interactive map.

When alternative routes are available, users can compare them by distance and estimated walking time.

## Running Locally

1. Clone the repository.
2. Install dependencies using `npm install`.
3. Start the development server using `npm run dev`.
4. Open the local URL displayed in the terminal.

## Limitations

WatAbility is a prototype, not a verified accessibility navigation service. Step-free access, slopes, surfaces, and building entrances have not been independently verified.

The application currently uses a public demonstration routing service. Manually saved pathways are not yet incorporated into automatic route calculations.

## Future Improvements

- Verified accessible building entrances
- More detailed sidewalk and ramp information
- Improved accessibility-aware route calculations
- Additional campus buildings
- Automated testing
