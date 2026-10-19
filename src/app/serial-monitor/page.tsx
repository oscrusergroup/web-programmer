import type { Metadata } from "next";
import { SerialMonitor } from "@/components/serial-monitor";

export const metadata: Metadata = {
  title: "OSCR Programmer · Serial monitor",
  description: "Read Arduino serial output and send commands to your cartridge reader over USB.",
};

export default function SerialMonitorPage() {
  return <SerialMonitor />;
}
