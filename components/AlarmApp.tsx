"use client";

import dynamic from "next/dynamic";

// Client-only: settings come from localStorage and the date from the viewer's locale.
const AlarmScreen = dynamic(() => import("./AlarmScreen"), { ssr: false });

export default function AlarmApp() {
  return <AlarmScreen />;
}
