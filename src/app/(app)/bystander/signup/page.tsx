import { redirect } from 'next/navigation';

export default function BystanderSignupRedirect() {
  redirect('/patient/register');
}
