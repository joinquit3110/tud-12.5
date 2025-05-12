import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dijkstra');
  // The rest of the original component won't be rendered after redirect,
  // but it's good practice to return null or an empty fragment.
  return null;
}
