import type { ChampionTraits, DamageProfile } from './types.ts';

interface ChampionInfo {
  attack: number;
  defense: number;
  magic: number;
}

const TRAIT_OVERRIDES: Record<string, Partial<ChampionTraits>> = {
  Malphite: { damageProfile: 'AP', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true },
  Ornn: { damageProfile: 'MIXED', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true },
  KSante: { damageProfile: 'AD', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true, hasPeel: true },
  Amumu: { damageProfile: 'AP', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true },
  Sejuani: { damageProfile: 'AP', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true },
  Zac: { damageProfile: 'AP', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true },
  Maokai: { damageProfile: 'AP', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true, hasPeel: true },
  Leona: { damageProfile: 'AP', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true, hasPeel: true },
  Nautilus: { damageProfile: 'AP', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true, hasPeel: true },
  Alistar: { damageProfile: 'AP', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true, hasPeel: true },
  Rell: { damageProfile: 'AP', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true, hasPeel: true },
  Thresh: { damageProfile: 'MIXED', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true, hasPeel: true },
  Braum: { damageProfile: 'AP', isTank: true, isFrontline: true, hasEngage: false, hasHardCC: true, hasPeel: true },
  Rakan: { damageProfile: 'AP', isTank: false, isFrontline: false, hasEngage: true, hasHardCC: true, hasPeel: true },
  Lulu: { damageProfile: 'AP', isTank: false, isFrontline: false, hasEngage: false, hasHardCC: true, hasPeel: true },
  Janna: { damageProfile: 'AP', isTank: false, isFrontline: false, hasEngage: false, hasHardCC: true, hasPeel: true },
  Nami: { damageProfile: 'AP', isTank: false, isFrontline: false, hasEngage: true, hasHardCC: true, hasPeel: true },
  JarvanIV: { damageProfile: 'AD', isTank: false, isFrontline: true, hasEngage: true, hasHardCC: true },
  Vi: { damageProfile: 'AD', isTank: false, isFrontline: true, hasEngage: true, hasHardCC: true },
  MonkeyKing: { damageProfile: 'AD', isTank: false, isFrontline: true, hasEngage: true, hasHardCC: true },
  LeeSin: { damageProfile: 'AD', isTank: false, isFrontline: true, hasEngage: true, hasHardCC: true, hasPeel: true },
  Sylas: { damageProfile: 'AP', isTank: false, isFrontline: false, hasEngage: true, hasHardCC: true },
  Mordekaiser: { damageProfile: 'AP', isTank: false, isFrontline: true, hasEngage: false, hasHardCC: true },
  Rumble: { damageProfile: 'AP', isTank: false, isFrontline: true, hasEngage: true, hasHardCC: false, hasPoke: true },
  Gwen: { damageProfile: 'AP', isTank: false, isFrontline: true, hasEngage: false, hasHardCC: false },
  Diana: { damageProfile: 'AP', isTank: false, isFrontline: true, hasEngage: true, hasHardCC: true },
  Lillia: { damageProfile: 'AP', isTank: false, isFrontline: false, hasEngage: true, hasHardCC: true },
  Gragas: { damageProfile: 'AP', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true, hasPeel: true },
  Corki: { damageProfile: 'AD', isTank: false, isFrontline: false, hasPoke: true },
  KogMaw: { damageProfile: 'MIXED', isTank: false, isFrontline: false, hasPoke: true },
  Kaisa: { damageProfile: 'MIXED', isTank: false, isFrontline: false, hasPoke: true },
  Varus: { damageProfile: 'MIXED', isTank: false, isFrontline: false, hasEngage: true, hasHardCC: true, hasPoke: true },
  Jax: { damageProfile: 'MIXED', isTank: false, isFrontline: true, hasEngage: true, hasHardCC: true },
  Yone: { damageProfile: 'MIXED', isTank: false, isFrontline: false, hasEngage: true, hasHardCC: true },
  Yasuo: { damageProfile: 'AD', isTank: false, isFrontline: false, hasEngage: true, hasHardCC: true },
  Ahri: { damageProfile: 'AP', isTank: false, isFrontline: false, hasEngage: true, hasHardCC: true },
  Orianna: { damageProfile: 'AP', isTank: false, isFrontline: false, hasEngage: true, hasHardCC: true, hasPoke: true },
  Syndra: { damageProfile: 'AP', isTank: false, isFrontline: false, hasHardCC: true, hasPoke: true },
  Azir: { damageProfile: 'AP', isTank: false, isFrontline: false, hasEngage: true, hasHardCC: true, hasPoke: true },
  Lissandra: { damageProfile: 'AP', isTank: false, isFrontline: false, hasEngage: true, hasHardCC: true, hasPeel: true },
  Galio: { damageProfile: 'AP', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true, hasPeel: true },
  Swain: { damageProfile: 'AP', isTank: false, isFrontline: true, hasHardCC: true },
  Pantheon: { damageProfile: 'AD', isTank: false, isFrontline: true, hasEngage: true, hasHardCC: true },
  Renekton: { damageProfile: 'AD', isTank: false, isFrontline: true, hasEngage: true, hasHardCC: true },
  Darius: { damageProfile: 'AD', isTank: false, isFrontline: true, hasHardCC: true },
  Garen: { damageProfile: 'AD', isTank: false, isFrontline: true },
  Sett: { damageProfile: 'AD', isTank: false, isFrontline: true, hasEngage: true, hasHardCC: true },
  Sion: { damageProfile: 'AD', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true },
  Shen: { damageProfile: 'MIXED', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true, hasPeel: true },
  Poppy: { damageProfile: 'AD', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true, hasPeel: true },
  Trundle: { damageProfile: 'AD', isTank: false, isFrontline: true, hasPeel: true },
  Volibear: { damageProfile: 'MIXED', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true },
  Skarner: { damageProfile: 'AD', isTank: true, isFrontline: true, hasEngage: true, hasHardCC: true },
  Udyr: { damageProfile: 'MIXED', isTank: true, isFrontline: true, hasHardCC: true },
  Hecarim: { damageProfile: 'AD', isTank: false, isFrontline: true, hasEngage: true, hasHardCC: true },
  Nocturne: { damageProfile: 'AD', isTank: false, isFrontline: true, hasEngage: true, hasHardCC: true },
};

function inferDamageProfile(tags: string[], info: ChampionInfo): DamageProfile {
  const isMage = tags.includes('Mage');
  const isMarksman = tags.includes('Marksman');
  const isSupport = tags.includes('Support');

  if (isMarksman && info.magic < 6) {
    return 'AD';
  }
  if (isMage && info.attack < 6) {
    return 'AP';
  }
  if (info.magic >= 6 && info.attack >= 6) {
    return 'MIXED';
  }
  if (info.magic >= info.attack + 2 || (isSupport && info.magic >= 5)) {
    return 'AP';
  }
  if (info.attack >= info.magic + 2) {
    return 'AD';
  }
  return 'MIXED';
}

/**
 * Infers composition traits from curated champion overrides plus Data Dragon tags/stats.
 */
export function inferChampionTraits(
  championKey: string,
  tags: string[],
  info: ChampionInfo,
): ChampionTraits {
  const isTank = tags.includes('Tank');
  const isFighter = tags.includes('Fighter');
  const isSupport = tags.includes('Support');
  const isMage = tags.includes('Mage');
  const isMarksman = tags.includes('Marksman');

  const base: ChampionTraits = {
    damageProfile: inferDamageProfile(tags, info),
    isTank,
    isFrontline: isTank || (isFighter && info.defense >= 5) || info.defense >= 7,
    hasEngage: isTank && info.defense >= 6,
    hasHardCC: isTank || isSupport,
    hasPeel: isSupport || isTank,
    hasPoke: isMage || isMarksman,
  };

  const override = TRAIT_OVERRIDES[championKey];
  return override ? { ...base, ...override } : base;
}
