import Image from "next/image";

export default function TeamLogo() {
  return (
    <Image
      className="team-logo"
      src="/team-sweden-logo.png"
      alt="Team Sweden emblem"
      width={150}
      height={150}
      priority
    />
  );
}
