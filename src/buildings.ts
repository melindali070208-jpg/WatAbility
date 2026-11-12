
export type Building = {
  id: string;
  name: string;
  coordinates: [number, number];
};

export const buildings: Building[] = [
  {
    id: "engineering",
    name: "Engineering 7",
    coordinates: [-80.53951, 43.47295]
  },
  {
    id: "library",
    name: "Dana Porter Library",
    coordinates: [-80.54227, 43.46972]
  },
  {
    id: "student-centre",
    name: "Student Life Centre",
    coordinates: [-80.54507, 43.47202]
  },
  {
    id: "science",
    name: "Science Teaching Complex",
    coordinates: [-80.54350, 43.47055]
  }
];
