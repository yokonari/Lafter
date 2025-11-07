"use client";

import { useEffect, useState } from "react";
import { ChannelBulkManager, type ChannelRow } from "../components/ChannelBulkManager";

type VideosAdminSectionProps = {
  initialChannels: ChannelRow[];
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevHref: string;
  nextHref: string;
};

export function VideosAdminSection({
  initialChannels,
  currentPage,
  hasPrev,
  hasNext,
  prevHref,
  nextHref,
}: VideosAdminSectionProps) {
  const [channels, setChannels] = useState<ChannelRow[]>(initialChannels);
  const [pagination, setPagination] = useState({
    currentPage,
    hasPrev,
    hasNext,
    prevHref,
    nextHref,
  });

  useEffect(() => {
    setChannels(initialChannels);
    setPagination({
      currentPage,
      hasPrev,
      hasNext,
      prevHref,
      nextHref,
    });
  }, [initialChannels, currentPage, hasPrev, hasNext, prevHref, nextHref]);

  const handleResults = () => {};

  return (
    <ChannelBulkManager
      channels={channels}
      currentPage={pagination.currentPage}
      hasPrev={pagination.hasPrev}
      hasNext={pagination.hasNext}
      prevHref={pagination.prevHref}
      nextHref={pagination.nextHref}
    />
  );
}
