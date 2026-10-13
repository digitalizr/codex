import type { Member } from '../types';
import '../member-avatar.css';

export interface MemberAvatarProps {
  member?: Member | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function MemberAvatar({ member, size = 'md', className = '' }: MemberAvatarProps) {
  const name = member?.name ?? '';
  const color = member?.color ?? '#809267';
  const hair = [...name].reduce((total, character) => total + character.charCodeAt(0), 0) % 4;
  const hairstyles = [
    'M21 37C18 23 24 12 39 12C55 12 62 23 58 37L54 27C45 31 38 23 32 26L25 33Z',
    'M20 37C17 29 20 18 28 15C29 8 39 9 43 13C52 9 60 19 59 28L58 39L54 27C45 31 34 26 26 31Z',
    'M20 40C15 25 23 11 40 12C56 11 64 25 60 43L54 37L54 27C43 24 37 17 31 29L25 31L24 43Z',
    'M21 38C16 22 24 11 40 12C55 12 62 26 58 38L54 29C47 26 42 29 37 25C31 30 28 24 25 31Z',
  ];
  return (
    <svg
      className={`member-avatar member-avatar-${size} ${className}`}
      viewBox="0 0 80 88"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 34C4 14 20 6 40 7C64 4 77 19 74 42L77 66C76 80 60 86 40 85C18 89 4 79 5 62Z"
        fill={`${color}20`}
      />
      <path d="M8 85C9 66 22 57 40 57C58 57 71 67 72 85Z" fill={color} />
      <path d="M30 59Q40 68 50 59L48 69Q40 73 32 69Z" fill="#ffffff50" />
      <path d="M33 51H47V63Q40 68 33 63Z" fill="#dfa986" />
      <ellipse cx="21" cy="39" rx="4" ry="6" fill="#e9b897" />
      <ellipse cx="59" cy="39" rx="4" ry="6" fill="#e9b897" />
      <ellipse cx="40" cy="36" rx="18" ry="22" fill="#edbf9e" />
      <path d={hairstyles[hair]} fill="#70543f" />
      <ellipse cx="30" cy="38" rx="1.6" ry="2" fill="#634936" />
      <ellipse cx="49" cy="38" rx="1.6" ry="2" fill="#634936" />
      <path
        d="M39 40L37 45H41"
        stroke="#cf936e"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <ellipse cx="27" cy="45" rx="4" ry="2.2" fill="#dd997d" opacity=".5" />
      <ellipse cx="53" cy="45" rx="4" ry="2.2" fill="#dd997d" opacity=".5" />
      <path
        d="M34 49Q40 55 46 49"
        stroke="#94604a"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M38 76C34 72 29 77 38 82C47 77 42 72 38 76Z" fill="#fff5df" opacity=".75" />
    </svg>
  );
}
