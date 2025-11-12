import type { VideoItem } from "@/lib/videoService";

type VideoDialogProps = {
  video: VideoItem | null;
  onClose: () => void;
};

export function VideoDialog({ video, onClose }: VideoDialogProps) {
  if (!video) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-0 py-8 sm:px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-none overflow-hidden bg-black shadow-2xl sm:max-w-4xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="閉じる"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-sm text-white transition hover:bg-white/30"
        >
          閉じる
        </button>
        <div className="relative w-full pb-[56.25%]">
          <iframe
            src={`https://www.youtube.com/embed/${video.videoId}`}
            className="absolute inset-0 h-full w-full"
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
