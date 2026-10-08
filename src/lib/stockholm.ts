export function stockholmLocal(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(iso))
    .replace(" ", "T");
}
export function stockholmIso(value: string) {
  let guess = Date.parse(`${value}:00Z`);
  const target = guess;
  for (let i = 0; i < 3; i++) {
    const shown = Date.parse(
      `${stockholmLocal(new Date(guess).toISOString())}:00Z`,
    );
    guess += target - shown;
  }
  if (stockholmLocal(new Date(guess).toISOString()) !== value)
    throw new Error(
      "This time does not exist in Stockholm due to daylight saving.",
    );
  return new Date(guess).toISOString();
}
