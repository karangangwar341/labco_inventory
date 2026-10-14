import { LoginForm } from '@/features/auth/components/LoginForm';

export const metadata = {
  title: 'Sign In | Labco Warehouse Operations',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <LoginForm />
    </div>
  );
}
