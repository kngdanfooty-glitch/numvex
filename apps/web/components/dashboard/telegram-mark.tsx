/** The Telegram paper plane, drawn inline (the icon set has none). Takes its colour from the text colour around it. */
export function TelegramMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.9 4.3 18.7 19.5c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6.1 13.1 1.2 11.6c-1.1-.3-1.1-1 .2-1.5L20.5 2.7c.9-.3 1.7.2 1.4 1.6Z" />
    </svg>
  );
}
