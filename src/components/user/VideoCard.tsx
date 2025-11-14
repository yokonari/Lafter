import Image from "next/image";
import { motion } from "motion/react";
import type { VideoItem } from "@/lib/videoService";

type VideoCardProps = {
  video: VideoItem;
  onSelect: (video: VideoItem) => void;
};

export function VideoCard({ video, onSelect }: VideoCardProps) {
  // サンプルと同じホバー挙動（scale + y offset）を motion で実装
  return (
    <motion.div
      whileHover={{ scale: 1.05, y: -4 }}
      transition={{ duration: 0.2 }}
      className="cursor-pointer block border-0 bg-white outline-none focus-visible:outline-none rounded-lg overflow-hidden"
      onClick={() => onSelect(video)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(video);
        }
      }}
    >
      <div className="relative overflow-hidden rounded-lg border-0" style={{ aspectRatio: "16 / 9" }}>
        <Image
          src={video.thumbnail}
          alt={video.title}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover"
        />
      </div>

      <div className="mt-2">
        <h3 className="line-clamp-2 text-sm font-medium text-slate-900">
          {video.title}
        </h3>
      </div>
    </motion.div>
  );
}
