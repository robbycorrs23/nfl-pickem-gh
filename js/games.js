/**
 * NFL Week 1 Pick'em — Game Schedule Data
 * ----------------------------------------
 * This is the single source of truth for the games shown in the app.
 * To update for a future week: replace WEEK_LABEL and the GAMES array.
 * Nothing else in the app needs to change — cards, progress, and the
 * generated message are all built dynamically from this data.
 *
 * kickoff: ISO 8601 string WITH a UTC offset so kickoff time renders
 * correctly for every visitor regardless of their device's timezone.
 * We display everything normalized to America/New_York (ET), which is
 * the standard way NFL kickoff times are communicated.
 */

const WEEK_LABEL = "Week 1";

const GAMES = [
  {
    id: "bears-panthers",
    away: { city: "Chicago", name: "Bears" },
    home: { city: "Carolina", name: "Panthers" },
    kickoff: "2026-09-13T13:00:00-04:00",
  },
  {
    id: "ravens-colts",
    away: { city: "Baltimore", name: "Ravens" },
    home: { city: "Indianapolis", name: "Colts" },
    kickoff: "2026-09-13T13:00:00-04:00",
  },
  {
    id: "falcons-steelers",
    away: { city: "Atlanta", name: "Falcons" },
    home: { city: "Pittsburgh", name: "Steelers" },
    kickoff: "2026-09-13T13:00:00-04:00",
  },
  {
    id: "browns-jaguars",
    away: { city: "Cleveland", name: "Browns" },
    home: { city: "Jacksonville", name: "Jaguars" },
    kickoff: "2026-09-13T13:00:00-04:00",
  },
  {
    id: "buccaneers-bengals",
    away: { city: "Tampa Bay", name: "Buccaneers" },
    home: { city: "Cincinnati", name: "Bengals" },
    kickoff: "2026-09-13T13:00:00-04:00",
  },
  {
    id: "jets-titans",
    away: { city: "New York", name: "Jets" },
    home: { city: "Tennessee", name: "Titans" },
    kickoff: "2026-09-13T13:00:00-04:00",
  },
  {
    id: "saints-lions",
    away: { city: "New Orleans", name: "Saints" },
    home: { city: "Detroit", name: "Lions" },
    kickoff: "2026-09-13T13:00:00-04:00",
  },
  {
    id: "bills-texans",
    away: { city: "Buffalo", name: "Bills" },
    home: { city: "Houston", name: "Texans" },
    kickoff: "2026-09-13T13:00:00-04:00",
  },
  {
    id: "cardinals-chargers",
    away: { city: "Arizona", name: "Cardinals" },
    home: { city: "Los Angeles", name: "Chargers" },
    kickoff: "2026-09-13T16:05:00-04:00",
  },
  {
    id: "packers-vikings",
    away: { city: "Green Bay", name: "Packers" },
    home: { city: "Minnesota", name: "Vikings" },
    kickoff: "2026-09-13T16:25:00-04:00",
  },
  {
    id: "dolphins-raiders",
    away: { city: "Miami", name: "Dolphins" },
    home: { city: "Las Vegas", name: "Raiders" },
    kickoff: "2026-09-13T16:25:00-04:00",
  },
  {
    id: "commanders-eagles",
    away: { city: "Washington", name: "Commanders" },
    home: { city: "Philadelphia", name: "Eagles" },
    kickoff: "2026-09-13T20:20:00-04:00",
  },
  {
    id: "cowboys-giants",
    away: { city: "Dallas", name: "Cowboys" },
    home: { city: "New York", name: "Giants" },
    kickoff: "2026-09-14T19:15:00-04:00",
  },
  {
    id: "broncos-chiefs",
    away: { city: "Denver", name: "Broncos" },
    home: { city: "Kansas City", name: "Chiefs" },
    kickoff: "2026-09-14T20:15:00-04:00",
  },
];
