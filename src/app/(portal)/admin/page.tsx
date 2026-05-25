import { redirect } from 'next/navigation';

/**
 * /admin bare entry point — redirect to the dashboard so a user pasting
 * `.../admin` (without a subpath) doesn't hit a 404.
 */
export default function AdminIndex() {
  redirect('/admin/dashboard');
}
