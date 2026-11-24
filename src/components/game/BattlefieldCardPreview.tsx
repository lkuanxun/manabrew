import { useCard } from "@/stores/useScryfallStore";
import { scryfallToSampleGameCard } from "@/lib/sampleGameCard";
import { cardFaceImageUris } from "@/lib/cardImage";
import { ArtCropCardFace } from "@/cardDisplay/ArtCropCardFace";
import { ART_CROP_ASPECT } from "@/cardDisplay";

const SAMPLE_CARD = "Goblin Guide";

export function BattlefieldCardPreview({ width = 88 }: { width?: number }) {
  const entry = useCard({ name: SAMPLE_CARD });
  const uris = entry ? cardFaceImageUris(entry.info, entry.uris) : undefined;

  if (!entry || !uris) {
    return (
      <div
        className="shrink-0 rounded-md border border-dashed border-border"
        style={{ width, height: width * ART_CROP_ASPECT }}
      />
    );
  }

  return (
    <ArtCropCardFace
      card={scryfallToSampleGameCard(entry.info)}
      artCrop={uris.art_crop}
      width={width}
    />
  );
}
