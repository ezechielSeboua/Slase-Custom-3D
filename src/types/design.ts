export type GarmentId = 'tshirt' | 'sweater';
export type FitId = 'normal' | 'oversize';
/** Zones d'impression. Gauche et droite s'entendent côté porteur : la manche gauche est à droite de l'image vue de face. */
export type ZoneId = 'front' | 'back' | 'left_sleeve' | 'right_sleeve';
export type TextAlign = 'left' | 'center' | 'right';

interface BaseElement {
  id: string;
  zone: ZoneId;
  /** Distance horizontale de l'axe central au centre de l'élément, en cm (positif vers la droite vu de face). */
  x_cm: number;
  /** Distance verticale du bas du col au centre de l'élément, en cm (positif vers le bas). */
  y_cm: number;
  width_cm: number;
  /** Rotation en degrés, sens horaire positif. */
  rotation_deg: number;
  hidden?: boolean;
  /** Nom du calque choisi par l'utilisateur ; à défaut, le nom du fichier ou le début du texte. */
  name?: string;
  /** Emplacement standard sur lequel l'élément est calé (config/placements.json) ; absent = placement libre. */
  placement?: string;
}

export interface ImageElement extends BaseElement {
  kind: 'image';
  /** Nom du fichier source importé. */
  asset: string;
  asset_id: string;
  source_px: [number, number];
}

export interface TextElement extends BaseElement {
  kind: 'text';
  text: string;
  font: string;
  color: string;
  weight: number;
  align: TextAlign;
  /** Rapport largeur / hauteur du texte rendu, recalculé à chaque modification. */
  aspect: number;
}

export type DesignElement = ImageElement | TextElement;

export interface Design {
  id: string;
  name: string;
  garment: GarmentId;
  fit: FitId;
  color: string;
  elements: DesignElement[];
  created_at: string;
  updated_at: string;
}

export interface AssetRecord {
  id: string;
  name: string;
  type: string;
  blob: Blob;
  width: number;
  height: number;
  /** Vrai si le bord de l'image est entièrement opaque (fond plein). */
  opaque_background: boolean;
  /** Vrai pour un SVG : pas de contrôle de résolution. */
  vector: boolean;
}

export type AssetMeta = Omit<AssetRecord, 'blob'>;
