'use client';

import { useEffect, useState } from 'react';

/**
 * Track whether the component has mounted on the client.
 *
 * Theme and wallet state only exist in the browser, so server and first client
 * renders must agree on a neutral value; this hook is the switch point.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
