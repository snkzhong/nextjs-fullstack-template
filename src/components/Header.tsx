// components/Header.tsx
import LanguageSwitcher from './LanguageSwitcher';

export default function Header({ locale }: { locale: string }) {
  return (
    <header className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-xl font-bold">My App</h1>
        <LanguageSwitcher />
      </div>
    </header>
  );
}