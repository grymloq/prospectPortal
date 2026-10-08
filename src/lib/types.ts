import type { Catalogue } from "./catalogue";
export type Phase = {
  id: string;
  name: string;
  kind: "application" | "review" | "selected";
};
export type User = {
  confirmedMember?: boolean;
  removedAt?: string;
  accountDeletedAt?: string;
  invitedAt?: string;
  acceptedAt?: string;
  inviteTokenHash?: string;
  inviteExpiresAt?: number;
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  faction: string;
  preferredFactions?: string[];
  defaultArmyId?: string;
  city: string;
  discordName?: string;
  bio: string;
  phaseId: string | null;
  rejected: boolean;
  application: string;
  password?: string;
};
export type Army = {
  listName?: string;
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
export type Patch = {
  catalogue?: Catalogue;
  id: string;
  name: string;
  date: string;
  removedAt?: string;
  source?: {
    provider: "newrecruit" | "warmind";
    url?: string;
    systemId?: number;
    revision: string;
    releaseRevision?: string;
    updatedAt: string;
    importedAt: string;
    books: { id: number; name: string; revision: number; sha: string }[];
  };
};
export type Game = {
  scrimId?: string;
  scrimPairingId?: string;
  id: string;
  userId: string;
  date: string;
  opponent: string;
  opponentUserId?: string;
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
  deadlines?: { id: string; title: string; at: string }[];
  scrimId?: string;
  id: string;
  title: string;
  location: string;
  online?: boolean;
  onlineUrl?: string;
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
export type MatrixList = {
  id: string;
  userId: string;
  patchId: string;
  army: Army;
  authorName: string;
  updatedAt: string;
};
export type ManualEstimate = {
  userId: string;
  patchId: string;
  row: string;
  column: string;
  layout: Layout;
  score: number;
  updatedAt: string;
  authorName: string;
};
export type PortalNotification = {
  id: string;
  key: string;
  userId: string;
  title: string;
  createdAt: string;
  readAt?: string;
  adminOnly?: boolean;
  page: "Profile" | "Users" | "Feedback inbox" | "Calendar" | "Scrims";
  profileId?: string;
  eventId?: string;
  scrimId?: string;
  deadline?: string;
  deliveries?: {
    subscriptionId: string;
    attempts: number;
    nextAttemptAt: number;
    sentAt?: string;
  }[];
};
export type BrowserSubscription = {
  id: string;
  userId: string;
  endpoint: string;
  keys: { auth: string; p256dh: string };
};
export type State = {
  notifications?: PortalNotification[];
  pushSubscriptions?: BrowserSubscription[];
  feedback?: Feedback[];
  membershipCutoverAt?: string;
  scrims?: Scrim[];
  savedArmies?: {
    id: string;
    userId: string;
    patchId: string;
    army: Army;
    shared: boolean;
    ownerName: string;
    updatedAt: string;
  }[];
  matrixListHistory?: {
    authorName: string;
    updatedAt: string;
    patchId: string;
    army: Army;
  }[];
  matrixChanges?: (Omit<ManualEstimate, "score"> & { score: number | null })[];
  matrixLists?: MatrixList[];
  manualEstimates?: ManualEstimate[];
  patches?: Patch[];
  defaultPatchId?: string;
  catalogue?: Catalogue;
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
export type FeedbackAttachment = {
  name: string;
  data?: string;
};
export type Feedback = {
  readAt?: string;
  readBy?: string;
  deletedAt?: string;
  id: string;
  userId: string;
  authorName: string;
  authorEmail: string;
  category: "Suggestion" | "Request" | "Bug";
  text: string;
  page: string;
  createdAt: string;
  attachments: FeedbackAttachment[];
};
export type ScrimComment = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
};
export type ScrimEntry = {
  id: string;
  userId?: string;
  name: string;
  army?: Army;
  savedArmyId?: string;
};
export type ScrimEstimate = {
  ownId: string;
  enemyId: string;
  scores: Record<Layout, number | null>;
  comments: ScrimComment[];
  history?: {
    scores: Record<Layout, number | null>;
    authorName: string;
    createdAt: string;
  }[];
  updatedBy?: string;
  updatedAt?: string;
};
export type ScrimTeam = {
  id: string;
  name: string;
  external: boolean;
  captainId: string;
  captainName: string;
  additionalCaptains?: { userId: string; name: string }[];
  coaches?: { userId: string; name: string }[];
  entries: ScrimEntry[];
  finalizedAt?: string;
  estimates: ScrimEstimate[];
};
export type ScrimPairing = {
  id: string;
  round: number;
  aId: string;
  bId: string;
  layout: Layout;
  scoreA?: number;
  date?: string;
  updatedBy?: string;
  updatedAt?: string;
  comments: ScrimComment[];
};
export type Scrim = {
  /** Derived by the server for the current response; never a client permission. */
  listsRevealed?: boolean;
  /** Public database configurations for preparing this scrim, supplied by the server. */
  databaseEntries?: ScrimEntry[];
  id: string;
  eventId: string;
  revision: number;
  kind: "internal" | "external";
  teamSize: number;
  patchId: string;
  submissionDeadline: string;
  teams: [ScrimTeam, ScrimTeam];
  pairings: ScrimPairing[];
  pairedAt?: string;
  completedAt?: string;
  cancelled?: boolean;
};
export type View = State & {
  pushDeviceIds?: string[];
  accessPreview?: {
    active: boolean;
    actorName: string;
    users: { id: string; name: string; role: User["role"] }[];
  };
  playerOptions: { id: string; name: string }[];
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
