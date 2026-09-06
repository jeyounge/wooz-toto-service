"use client";
import { useEffect } from 'react';

/**
 * AdSlot — 기존 z-labs AdSense 슬롯 컨벤션 재사용.
 * 클라이언트 스크립트(adsbygoogle)는 루트 레이아웃 <head>에서 로드된다.
 * 실제 슬롯 ID는 승인 후 주입. 뼈대 단계에서는 자리만 확보.
 *
 * @param {string} slot   - 광고 슬롯 ID (AdSense 대시보드)
 * @param {string} format - 'auto' | 'fluid' 등
 */
export default function AdSlot({ slot, format = 'auto', className = '' }) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

  useEffect(() => {
    if (!client || !slot) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // 광고 로드 실패는 조용히 무시.
    }
  }, [client, slot]);

  // 슬롯 미설정 시(뼈대) 플레이스홀더만 렌더.
  if (!client || !slot) {
    return (
      <div
        className={`flex items-center justify-center border border-dashed border-line bg-card text-sub text-xs rounded-lg py-6 ${className}`}
        aria-hidden="true"
      >
        광고 영역 (AdSense 슬롯)
      </div>
    );
  }

  return (
    <ins
      className={`adsbygoogle block ${className}`}
      style={{ display: 'block' }}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
}
