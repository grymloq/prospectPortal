"use client";
import { useState } from "react";
import { Menu, type LucideIcon } from "lucide-react";
import { Modal } from "./ui";
import styles from "./mobile-navigation.module.css";

type Destination = { name: string; page: string; icon: LucideIcon };
const primaryPages = ["Profile", "Game journal", "Matchup matrix", "Scrims"];
const labels = ["Profile", "Journal", "Matrix", "Scrims"];

export default function MobileNavigation({
  items,
  currentPage,
  onNavigate,
  unreadFeedback,
  pendingUsers,
}: {
  items: Destination[];
  currentPage: string;
  onNavigate: (page: string) => void;
  unreadFeedback: number;
  pendingUsers: number;
}) {
  const [open, setOpen] = useState(false);
  const remaining = items.filter((item) => !primaryPages.includes(item.page));
  function navigate(page: string) {
    setOpen(false);
    onNavigate(page);
  }
  return (
    <>
      <nav className={styles.bar} aria-label="Mobile navigation">
        {primaryPages.map((page, index) => {
          const item = items.find((item) => item.page === page)!;
          return (
            <button
              key={page}
              type="button"
              aria-label={item.name}
              aria-current={currentPage === page ? "page" : undefined}
              onClick={() => navigate(page)}
            >
              <item.icon size={22} aria-hidden="true" />
              <span>{labels[index]}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-label={
            unreadFeedback || pendingUsers
              ? `More, ${unreadFeedback} unread feedback messages, ${pendingUsers} users awaiting confirmation`
              : "More"
          }
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-current={
            !primaryPages.includes(currentPage) ? "page" : undefined
          }
          onClick={() => setOpen(true)}
        >
          <span className={styles.moreIcon}>
            <Menu size={22} aria-hidden="true" />
            {(unreadFeedback > 0 || pendingUsers > 0) && (
              <span className={styles.dot} />
            )}
          </span>
          <span>More</span>
        </button>
      </nav>
      {open && (
        <Modal title="More" onClose={() => setOpen(false)}>
          <nav className={styles.menu} aria-label="More destinations">
            {remaining.map((item) => (
              <button
                key={item.page}
                type="button"
                aria-current={currentPage === item.page ? "page" : undefined}
                onClick={() => navigate(item.page)}
              >
                <item.icon size={22} aria-hidden="true" />
                <span>{item.name}</span>
                {item.page === "Users" && pendingUsers > 0 && (
                  <span
                    className="feedback-unread-badge"
                    aria-label={`${pendingUsers} users awaiting confirmation`}
                  >
                    {pendingUsers}
                  </span>
                )}
                {item.page === "Feedback inbox" && unreadFeedback > 0 && (
                  <span className="feedback-unread-badge">
                    {unreadFeedback}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </Modal>
      )}
    </>
  );
}
