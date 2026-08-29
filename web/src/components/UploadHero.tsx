import Image from "next/image";
import { type ReactNode } from "react";
import { Clock, CloudUpload, MessageCircle, Settings } from "lucide-react";

function Badge({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`absolute z-10 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white shadow-md ${className}`}
    >
      {children}
    </span>
  );
}

export function UploadHero() {
  return (
    <div
      className="relative mx-auto mt-7 mb-8 h-[168px] w-[168px] sm:mt-8 sm:mb-10 sm:h-[200px] sm:w-[200px]"
      aria-hidden
    >
      <div className="absolute inset-0 rounded-full bg-accent/20 blur-[2px]" />
      <div className="absolute inset-[6px] rounded-full border-[3px] border-accent/30" />
      <div className="absolute inset-[16px] rounded-full border-2 border-accent/20" />
      <div className="absolute inset-[28px] overflow-hidden rounded-full bg-[#f3d5c4] ring-2 ring-white">
        <Image
          src="/teacher-avatar.png"
          alt=""
          fill
          sizes="140px"
          className="object-cover object-[center_18%]"
        />
      </div>
      <div className="upload-hero-orbit pointer-events-none absolute inset-0">
        <Badge className="upload-hero-badge top-[4%] left-[12%]">
          <Clock className="h-3.5 w-3.5" />
        </Badge>
        <Badge className="upload-hero-badge top-[4%] right-[10%]">
          <MessageCircle className="h-3.5 w-3.5" />
        </Badge>
        <Badge className="upload-hero-badge bottom-[8%] right-[6%]">
          <CloudUpload className="h-3.5 w-3.5" />
        </Badge>
        <Badge className="upload-hero-badge bottom-[10%] left-[4%]">
          <Settings className="h-3.5 w-3.5" />
        </Badge>
      </div>
    </div>
  );
}
