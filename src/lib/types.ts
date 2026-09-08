export type Phase = {
  id: string;
  name: string;
  kind: "application" | "review" | "selected";
};
export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  faction: string;
  city: string;
  bio: string;
  phaseId: string | null;
  rejected: boolean;
  application: string;
  password?: string;
};
export type Army = {
  faction: string;
  detachments: string[];
  disposition: string;
  listUrl: string;
  revision: number;
  factionName: string;
  detachmentNames: string[];
  dispositionName: string;
};
export type Layout = "A" | "B" | "C";
export type Patch = { id: string; name: string; date: string };
export type Game = {
  id: string;
  userId: string;
  date: string;
  opponent: string;
  own: Army;
  enemy: Army;
  score: number;
  layout?: Layout | null;
  patchId?: string;
  outcome: "Win" | "Draw" | "Loss";
  context: string;
  notes: string;
  eventId: string;
  updatedAt: string;
};
export type Rating = { score: number | null; note: string };
export type Evaluation = {
  userId: string;
  revision: number;
  ratings: Rating[];
  updatedBy: string;
  updatedAt: string;
};
export type Message = {
  id: string;
  userId: string;
  authorId: string;
  authorName: string;
  internal: boolean;
  text: string;
  createdAt: string;
};
export type Goal = {
  id: string;
  userId: string;
  title: string;
  description: string;
  due: string;
  status: "Not started" | "In progress" | "Ready for review" | "Completed";
  evidence: string;
  gameId: string;
  createdBy: string;
};
export type TeamEvent = {
  id: string;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  description: string;
  cancelled: boolean;
};
export type EventApplication = {
  id: string;
  eventId: string;
  userId: string;
  status: "Pending" | "Approved" | "Declined" | "Withdrawn";
  updatedAt: string;
};
export type Audit = {
  id: string;
  actor: string;
  text: string;
  createdAt: string;
};
export type State = {
  patches?: Patch[];
  users: User[];
  phases: Phase[];
  games: Game[];
  evaluations: Evaluation[];
  evaluationHistory?: Evaluation[];
  messages: Message[];
  goals: Goal[];
  events: TeamEvent[];
  applications: EventApplication[];
  audit: Audit[];
};
export type View = State & {
  me: User;
  occupancy: Record<string, number>;
  patches: Patch[];
};
export const criteria = [
  "Core rules, WTC FAQ & GW FAQ",
  "Own army rules",
  "Opponent army rules",
  "Map understanding",
  "Stress & adversity",
  "Initiative",
  "Reliability",
  "Discussion & communication",
  "Team spirit",
  "Sportsmanship",
  "Competitive drive",
  "Clock management",
  "Analysis, predictions, strategy & deployment",
  "Table presence & awareness",
  "Objectivity & faction overview",
  "Probability assessment",
  "Precision",
  "Melee & movement",
];
export const originalCriteria = [
  "Kunskap kring Grundregler, WTC FAQ & GW FAQ",
  "Kunna sin egen armes regler",
  "Motståndarens Armes regler",
  "Kartförståelse",
  "Förmåga att hantera stress & motgångar",
  "Initiativförmåga",
  "Pålitlighet",
  "Diskussionsförmåga",
  "Laganda",
  "Sportmannaskap",
  "Vinnarskalle",
  "Klockhantering",
  "Analytisk förmåga predictions, matchstrategi & deployment",
  "Bordsalfa & Bordshök",
  "Saklighet och överblick mellan faktionerna",
  "Sannolikhetsbedömning",
  "Precision",
  "Närstrid och dess movement",
];
