export type HostIdea = {
  title: string;
  place: string;
  detail: string;
  sourceLabel: string;
  sourceUrl: string;
};

export type LocalGuide = {
  slug: string;
  kind: "county" | "city";
  name: string;
  county: "Broward County" | "Miami-Dade County" | "Palm Beach County";
  title: string;
  description: string;
  h1: string;
  intro: string;
  intent: string;
  difference: string;
  ideas: HostIdea[];
  municipalitySource?: string;
  related: string[];
};

const checked = "October 2, 2026";

export const LOCAL_GUIDES: LocalGuide[] = [
  {
    slug: "broward-county",
    kind: "county",
    name: "Broward County",
    county: "Broward County",
    title: "Things to Do in Broward County | Host a Local Plan | QuestHat",
    description: "Looking for things to do or people to meet in Broward County? Start a real local plan on QuestHat with a time, place, and people who want to join.",
    h1: "Things to do in Broward County start with one real plan.",
    intro: "Broward County has beach paths, downtown riverfront space, and city parks that make a good first plan easy to name. QuestHat is for turning one of those ideas into an activity with a real date, time, and meeting place.",
    intent: "things to do in Broward County; meet people in Broward County",
    difference: "A county-level starting point that sends readers to the published Fort Lauderdale guide instead of pretending every Broward municipality has the same local options.",
    ideas: [
      { title: "Plan a riverfront walk and coffee stop", place: "Riverwalk Linear Park, Fort Lauderdale", detail: "The city identifies Riverwalk as a linear park along the New River; make the route and meeting time clear in your plan.", sourceLabel: "City of Fort Lauderdale Riverwalk District", sourceUrl: "https://www.fortlauderdale.gov/home/showpublisheddocument/94011/639031402524300000" },
      { title: "Host a beach-park picnic", place: "Fort Lauderdale Beach Park", detail: "The city lists accessible picnic tables, grills, restrooms, and showers—useful details when you are choosing a casual daytime meetup.", sourceLabel: "Fort Lauderdale Parks & Recreation", sourceUrl: "https://www.parks.fortlauderdale.gov/parks/parks/ada-accessibility-information" },
      { title: "Set up a tennis partner session", place: "George English Tennis Center, Fort Lauderdale", detail: "The city parks directory lists the tennis center among its facilities; confirm court availability before publishing your time.", sourceLabel: "Fort Lauderdale Parks & Recreation", sourceUrl: "https://www.parks.fortlauderdale.gov/" },
    ],
    related: ["fort-lauderdale"],
  },
  {
    slug: "miami-dade-county",
    kind: "county",
    name: "Miami-Dade County",
    county: "Miami-Dade County",
    title: "Things to Do in Miami-Dade County | Meet People Locally | QuestHat",
    description: "Find a first activity idea in Miami-Dade County and host it on QuestHat with a real time and place. Start a local plan instead of waiting for the group chat.",
    h1: "Meet people in Miami-Dade County by hosting something specific.",
    intro: "From downtown waterfront walks to neighborhood recreation, Miami-Dade gives you plenty of reasons to get off the couch. On QuestHat, pick one idea, set a time and place, then decide who joins your activity.",
    intent: "things to do in Miami-Dade County; meet people in Miami-Dade County",
    difference: "A county guide that acknowledges the county’s incorporated municipalities and unincorporated communities, then points to the researched City of Miami guide.",
    ideas: [
      { title: "Host a downtown waterfront walk", place: "Maurice A. Ferré Park, Miami", detail: "The City of Miami lists this Biscayne Boulevard park as open area; keep the plan simple with a visible meeting point near the park entrance.", sourceLabel: "City of Miami park directory", sourceUrl: "https://www.miami.gov/Parks-Public-Places/Parks-Directory/Maurice-A.-Ferr%C3%A9-Park" },
      { title: "Start a casual outdoor yoga meetup", place: "Bayfront Park, Miami", detail: "Bayfront Park’s official site lists outdoor yoga among park activities and publishes daily hours; verify the current schedule before setting your time.", sourceLabel: "Bayfront Park Management Trust", sourceUrl: "https://www.bayfrontparkmiami.com/bayfront-park" },
      { title: "Make a pickleball plan", place: "Bryan Park, Miami", detail: "Miami Parks lists pickleball courts at Bryan Park and its public court days. Put the confirmed day and start time in your QuestHat activity.", sourceLabel: "City of Miami Parks & Recreation", sourceUrl: "https://www.miami.gov/Parks-Public-Places/Parks-Department" },
    ],
    related: ["miami"],
  },
  {
    slug: "palm-beach-county",
    kind: "county",
    name: "Palm Beach County",
    county: "Palm Beach County",
    title: "Things to Do in Palm Beach County | Host a Plan | QuestHat",
    description: "Looking for things to do or new people to meet in Palm Beach County? Turn a local idea into a real activity with QuestHat.",
    h1: "Find things to do in Palm Beach County—then host one.",
    intro: "Palm Beach County has waterfront paths, city parks, and places made for a low-pressure first meetup. QuestHat helps you take the useful next step: create a plan with a date, time, and public meeting place.",
    intent: "things to do in Palm Beach County; meet people in Palm Beach County",
    difference: "A county-level guide focused on practical first-host ideas and the locally researched West Palm Beach waterfront rather than generic beach copy.",
    ideas: [
      { title: "Host a waterfront walking group", place: "Waterfront Commons, West Palm Beach", detail: "The city lists paved walking trails, picnic tables, shade areas, toilets, and water fountains—helpful for a simple daytime plan.", sourceLabel: "City of West Palm Beach Waterfront Commons", sourceUrl: "https://www.wpb.org/Departments/Parks-Recreation/Parks-Facilities/Waterfront-Commons" },
      { title: "Plan a market stroll and coffee", place: "Waterfront Commons and Clematis Street, West Palm Beach", detail: "The city’s GreenMarket information identifies Waterfront Commons and the 100 block of Clematis as the setting; check the official event calendar before publishing a date.", sourceLabel: "City of West Palm Beach GreenMarket", sourceUrl: "https://www.wpb.org/Events-Folder/2026/West-Palm-Beach-GreenMarket-04.04-05.30.2026" },
      { title: "Set a sunrise-to-sunset park meetup", place: "A West Palm Beach city park", detail: "The city says its parks are open sunrise to sunset year-round; choose a specific park and public meeting point before you host.", sourceLabel: "City of West Palm Beach Parks & Recreation", sourceUrl: "https://www.wpb.org/Departments/Parks-Recreation" },
    ],
    related: ["west-palm-beach"],
  },
  {
    slug: "fort-lauderdale",
    kind: "city",
    name: "Fort Lauderdale",
    county: "Broward County",
    title: "Things to Do in Fort Lauderdale | Host a Local Plan | QuestHat",
    description: "Ideas for things to do and people to meet in Fort Lauderdale: host a Riverwalk stroll, beach-park picnic, or tennis session with QuestHat.",
    h1: "Host your next Fort Lauderdale plan instead of waiting for an invite.",
    intro: "Looking for things to do in Fort Lauderdale or people to do them with? Start with a place that makes the plan clear: a New River walk, a beach-park picnic, or a tennis session. QuestHat lets you give that idea a real time, place, and guest list.",
    intent: "things to do in Fort Lauderdale; meet people in Fort Lauderdale",
    difference: "Built around Fort Lauderdale’s New River Riverwalk, beach-park facilities, and city tennis center—not interchangeable South Florida recommendations.",
    municipalitySource: "https://browardvotes.gov/sites/default/files/documents/AtYourServiceGuide-download.pdf",
    ideas: [
      { title: "New River walk and conversation", place: "Riverwalk Linear Park", detail: "The Riverwalk District is a 1.5-mile linear park along the New River with brick walkways and pedestrian amenities. Choose a start point and an easy pace.", sourceLabel: "City of Fort Lauderdale Riverwalk District", sourceUrl: "https://www.fortlauderdale.gov/home/showpublisheddocument/94011/639031402524300000" },
      { title: "Beach-park picnic", place: "Fort Lauderdale Beach Park", detail: "The city lists accessible picnic tables and grills, plus restrooms and showers. It fits a daytime picnic where the host can name a specific public meeting spot.", sourceLabel: "Fort Lauderdale Parks & Recreation", sourceUrl: "https://www.parks.fortlauderdale.gov/parks/parks/ada-accessibility-information" },
      { title: "Tennis partner session", place: "George English Tennis Center", detail: "George English Tennis Center appears in the city’s parks and facilities directory. Confirm the court plan first, then post the level and start time you want.", sourceLabel: "Fort Lauderdale Parks & Recreation", sourceUrl: "https://www.parks.fortlauderdale.gov/" },
    ],
    related: ["broward-county"],
  },
  {
    slug: "miami",
    kind: "city",
    name: "Miami",
    county: "Miami-Dade County",
    title: "Things to Do in Miami | Host a Local Activity | QuestHat",
    description: "Looking for things to do or people to meet in Miami? Host a waterfront walk, outdoor yoga meetup, or pickleball session on QuestHat.",
    h1: "Turn a Miami idea into a real plan with people who are down.",
    intro: "Miami has public waterfront space, outdoor movement, and park courts that can make a first plan feel natural. Instead of leaving it in the group chat, create a QuestHat activity with a real time and place, then choose who joins.",
    intent: "things to do in Miami; meet people in Miami",
    difference: "Focused on City of Miami waterfront parks and city-run recreation details, rather than treating Miami as a catch-all for Miami-Dade County.",
    municipalitySource: "https://www.miamidade.gov/global/management/municipalities.page",
    ideas: [
      { title: "Waterfront walk with a clear meeting point", place: "Maurice A. Ferré Park", detail: "The City of Miami lists the park at 1075 Biscayne Boulevard and identifies it as open area. Use the public address or an entrance landmark in your plan.", sourceLabel: "City of Miami park directory", sourceUrl: "https://www.miami.gov/Parks-Public-Places/Parks-Directory/Maurice-A.-Ferr%C3%A9-Park" },
      { title: "Outdoor yoga and post-class coffee", place: "Bayfront Park", detail: "Bayfront Park’s official site lists outdoor yoga and is open daily from 7 a.m. to 11 p.m. Confirm the current yoga schedule before selecting your time.", sourceLabel: "Bayfront Park Management Trust", sourceUrl: "https://www.bayfrontparkmiami.com/bayfront-park" },
      { title: "Beginner-friendly pickleball plan", place: "Bryan Park", detail: "City of Miami Parks lists pickleball at Bryan Park and notes public court days. State whether you are bringing equipment and the skill level you want.", sourceLabel: "City of Miami Parks & Recreation", sourceUrl: "https://www.miami.gov/Parks-Public-Places/Parks-Department" },
    ],
    related: ["miami-dade-county"],
  },
  {
    slug: "west-palm-beach",
    kind: "city",
    name: "West Palm Beach",
    county: "Palm Beach County",
    title: "Things to Do in West Palm Beach | Host a Plan | QuestHat",
    description: "Find things to do and people to meet in West Palm Beach. Host a waterfront walk, market stroll, or city-park meetup on QuestHat.",
    h1: "Make a West Palm Beach plan people can actually say yes to.",
    intro: "If you are looking for things to do in West Palm Beach, start with a plan that is easy to picture: a waterfront walk, a market stroll, or a park meetup. QuestHat helps you make it specific with a real date, time, and public meeting place.",
    intent: "things to do in West Palm Beach; meet people in West Palm Beach",
    difference: "Grounded in the city’s Waterfront Commons features and West Palm Beach’s official community-event information, not a generic Palm Beach County list.",
    municipalitySource: "https://discover.pbc.gov/pages/municipalities.aspx",
    ideas: [
      { title: "Waterfront walk and conversation", place: "Waterfront Commons", detail: "The city lists paved walking trails, shade areas, picnic tables, toilets, and water fountains at 100 N. Clematis Street—solid basics for a first public meetup.", sourceLabel: "City of West Palm Beach Waterfront Commons", sourceUrl: "https://www.wpb.org/Departments/Parks-Recreation/Parks-Facilities/Waterfront-Commons" },
      { title: "GreenMarket stroll", place: "Waterfront Commons and the 100 block of Clematis Street", detail: "The city’s GreenMarket page lists this setting and its seasonal dates. Treat it as an idea to host and check the current official schedule before you post it.", sourceLabel: "City of West Palm Beach GreenMarket", sourceUrl: "https://www.wpb.org/Events-Folder/2026/West-Palm-Beach-GreenMarket-04.04-05.30.2026" },
      { title: "Downtown dock-view walk", place: "Waterfront Commons city docks", detail: "The city says its Waterfront Commons docks are open to the public daily and the South Clematis dock has seating and skyline views. Confirm conditions before meeting there.", sourceLabel: "City of West Palm Beach Parks & Recreation", sourceUrl: "https://www.wpb.org/Departments/Parks-Recreation" },
    ],
    related: ["palm-beach-county"],
  },
];

export const LOCAL_GUIDE_CHECKED_DATE = checked;

export function getLocalGuide(slug: string) {
  return LOCAL_GUIDES.find((guide) => guide.slug === slug);
}
