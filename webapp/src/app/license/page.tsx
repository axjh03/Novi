import { redirect } from 'next/navigation';

// The private license page became Get access; keep old links working.
export default function LicenseRedirect() {
  redirect('/get-access');
}
