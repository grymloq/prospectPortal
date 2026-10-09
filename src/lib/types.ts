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
  /** Optional imported composition; catalogue revision below is not a list version. */
  composition?: RosterComposition;
  scope?: ArmyScope;
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
export type ArmyScope = {
  systemId?: string;
  edition?: string;
  battleSize?: string;
  /** Verified continuity identifier; absent means ruleset-scoped classification. */
  continuityKey?: string;
};
export type RosterSelection = {
  /** Provider/system/catalogue namespaced source identity. */
  sourceId: string;
  name: string;
  kind: "unit" | "model" | "option" | "enhancement";
  quantity: number;
  selections: RosterSelection[];
};
export type RosterComposition = {
  status: "complete" | "partial" | "unavailable";
  normalizationVersion: string;
  selections: RosterSelection[];
  fingerprint?: string;
  canonical?: string;
  reasons: string[];
  source: {
    provider: "newrecruit";
    systemId?: string;
    catalogueId?: string;
    catalogueRevision?: string;
    importedAt?: string;
  };
};
export type SavedArmy = {
  id: string;
  userId: string;
  patchId: string;
  army: Army;
  shared: boolean;
  ownerName: string;
  updatedAt: string;
  currentVersionId?: string;
  listRevision?: number;
};
export type ArmyListVersion = {
  id: string;
  listId: string;
  userId: string;
  number: number;
  patchId: string;
  army: Army;
  createdAt: string;
  /** Visibility metadata may change; army, patch and creation facts are immutable. */
  published: boolean;
};
export type GameContextReference = {
  id: string;
  name: string;
  version: string;
  source?: string;
};
export type RecordedGameContext = {
  version: "1";
  missionPack?: GameContextReference;
  deployment?: GameContextReference;
  ownMission?: GameContextReference;
  enemyMission?: GameContextReference;
};
export type LibraryMembership = {
  id: string;
  listId: string;
  versionId: string;
  patchId: string;
  archetypeId: string;
  variationId?: string;
  classificationVersion: string;
  classifiedAt: string;
};
export type LibraryTarget = { kind: "list" | "archetype"; id: string };
export type LibraryDiscussionContext = {
  patchId?: string;
  versionId?: string;
  variationId?: string;
  opponentArchetypeId?: string;
};
export type LibraryDiscussion = {
  id: string;
  target: LibraryTarget;
  parentId?: string;
  context?: LibraryDiscussionContext;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
};
export type LibraryFilters = {
  /** Omitted = current team default; "all" explicitly opts into patch-separated history. */
  patchId?: string;
  search?: string;
  faction?: string;
  detachments?: string[];
  disposition?: string;
  opponentFaction?: string;
  opponentArchetypeId?: string;
  opponentListId?: string;
  opponentVariationId?: string;
  deploymentId?: string;
  missionId?: string;
  dateFrom?: string;
  dateTo?: string;
};
export type LibraryQuery = LibraryFilters & {
  tab?: "lists" | "archetypes";
  target?: LibraryTarget;
  versionId?: string;
  page?: number;
  pageSize?: number;
  sort?: "name" | "score" | "matches";
};
export type LibraryMetrics = {
  averageScore: number | null;
  winRate: number | null;
  wins: number;
  draws: number;
  losses: number;
  recordedMatches: number;
  appearances: number;
  contributors: number;
  scoreInterval: [number, number] | null;
  singleContributor: boolean;
};
export type LibraryTrend = {
  month: string;
  patchId: string;
  metrics: LibraryMetrics;
};
export type LibraryMatchup = {
  dimension: "faction" | "archetype" | "list" | "variation" | "deployment" | "mission";
  id: string;
  label: string;
  classification: "good" | "bad" | "uncertain";
  mirror: boolean;
  metrics: LibraryMetrics;
};
export type LibraryListRow = {
  id: string;
  kind: "saved" | "matrix";
  name: string;
  ownerName: string;
  army: Army;
  patchId: string;
  versionId?: string;
  archetypeId: string;
  variationId?: string;
  compositionStatus: RosterComposition["status"];
  metrics: LibraryMetrics;
};
export type LibraryVariation = {
  id: string;
  listIds: string[];
  composition: RosterComposition;
  metrics: LibraryMetrics;
  leading: boolean;
};
export type LibraryArchetypeRow = {
  id: string;
  name: string;
  army: Army;
  publicLists: number;
  variations: number;
  unclassifiedLists: number;
  patchIds: string[];
  metrics: LibraryMetrics;
};
export type LibraryVersionRow = {
  id: string;
  number: number;
  patchId: string;
  army: Army;
  createdAt: string;
  metrics: LibraryMetrics;
};
export type LibraryDetail = {
  target: LibraryTarget;
  name: string;
  army: Army;
  ownerName?: string;
  archetypeId: string;
  metrics: LibraryMetrics;
  matchups: LibraryMatchup[];
  trends: LibraryTrend[];
  versions: LibraryVersionRow[];
  variations: LibraryVariation[];
  lists: LibraryListRow[];
  discussions: LibraryDiscussion[];
  /** All-ruleset summaries always expose individual patch segments. */
  segments: { patchId: string; metrics: LibraryMetrics; publicLists: number; variations: number }[];
  coverage: { unclassifiedAppearances: number; missingDeployment: number; missingMission: number; conflicts: number };
};
export type ArmyLibraryDTO = {
  tab: "lists" | "archetypes";
  filters: LibraryFilters;
  page: number;
  pageSize: number;
  total: number;
  lists: LibraryListRow[];
  archetypes: LibraryArchetypeRow[];
  detail?: LibraryDetail;
  patches: { id: string; name: string; date: string }[];
  facets: { factions: { id: string; name: string }[]; detachments: { id: string; name: string }[]; dispositions: { id: string; name: string }[] };
  policy: { leadingMinimumMatches: number; uncertainty: string };
};
export type ConsolidationPreview = {
  sourceRevision: string;
  classificationVersion: string;
  newArchetypes: number;
  existingArchetypes: number;
  newVariations: number;
  duplicateCompositions: number;
  unclassified: { listId: string; reason: string }[];
  memberships: LibraryMembership[];
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
  ownListVersionId?: string;
  enemyListVersionId?: string;
  /** Explicit consent to share this player's recorded perspective only. */
  libraryContribution?: boolean;
  canonicalMatchId?: string;
  gameContext?: RecordedGameContext;
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
  armyVersions?: ArmyListVersion[];
  libraryMemberships?: LibraryMembership[];
  libraryDiscussions?: LibraryDiscussion[];
  notifications?: PortalNotification[];
  pushSubscriptions?: BrowserSubscription[];
  feedback?: Feedback[];
  membershipCutoverAt?: string;
  scrims?: Scrim[];
  savedArmies?: SavedArmy[];
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
  listVersionId?: string;
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
  gameContext?: RecordedGameContext;
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
/** Library collections are queried through their dedicated authorized DTO endpoint. */
export type View = Omit<State, "armyVersions" | "libraryMemberships" | "libraryDiscussions"> & {
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
