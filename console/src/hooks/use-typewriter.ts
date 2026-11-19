import { useEffect, useState } from 'react';

export interface TypewriterOptions {
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
  /** False holds a whole text still (reduced motion, hidden input) */
  animate?: boolean;
}

/**
 * Types each text out, holds it, deletes it and moves on to the next, starting
 * from a random one. Returns the text shown right now.
 */
export function useTypewriter(
  texts: string[],
  {
    typingSpeed = 50,
    deletingSpeed = 30,
    pauseDuration = 2000,
    animate = true,
  }: TypewriterOptions = {},
): string {
  const [displayText, setDisplayText] = useState('');
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.floor(Math.random() * texts.length),
  );
  // A new list (e.g. ask/agent switch) can be shorter than the old index:
  // start over on a text from the new list.
  const [prevTexts, setPrevTexts] = useState(texts);
  if (texts !== prevTexts) {
    setPrevTexts(texts);
    setDisplayText('');
    setCharIndex(0);
    setIsDeleting(false);
    setCurrentIndex(Math.floor(Math.random() * texts.length));
  }

  useEffect(() => {
    if (!animate) return;
    const currentText = texts[currentIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (!isDeleting && charIndex < currentText.length) {
      // Typing forward
      timeout = setTimeout(() => {
        setDisplayText(currentText.slice(0, charIndex + 1));
        setCharIndex(charIndex + 1);
      }, typingSpeed);
    } else if (!isDeleting && charIndex === currentText.length) {
      // Pause before deleting
      timeout = setTimeout(() => {
        setIsDeleting(true);
      }, pauseDuration);
    } else if (isDeleting && charIndex > 0) {
      // Deleting backward
      timeout = setTimeout(() => {
        setDisplayText(currentText.slice(0, charIndex - 1));
        setCharIndex(charIndex - 1);
      }, deletingSpeed);
    } else if (isDeleting && charIndex === 0) {
      // Move to next text
      timeout = setTimeout(() => {
        setIsDeleting(false);
        setCurrentIndex((prev) => (prev + 1) % texts.length);
      }, 500);
    }

    return () => clearTimeout(timeout);
  }, [
    animate,
    charIndex,
    isDeleting,
    currentIndex,
    texts,
    typingSpeed,
    deletingSpeed,
    pauseDuration,
  ]);

  return animate ? displayText : texts[currentIndex];
}
