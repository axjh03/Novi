'use client';

import Laptop3D from './Laptop3D';
import { Desk } from './ScreenCompare';

/* The listening bar where it lives: over a video call, on a Mac, on the real laptop. The desk is the
   same one the compare slider draws, with Novi's own window on it. */
export default function DeskLaptop({ className = '' }: { className?: string }) {
  return (
    <Laptop3D className={className} label="A MacBook on a video call, with the floating Novi bar listening and its transcript and follow-up questions beside the call">
      <Desk withNovi />
    </Laptop3D>
  );
}
