import Link from "next/link";
import { notFound } from "next/navigation";

import { CompetitorNoteEditor } from "@/components/competitor-note";
import { Card, Chip, DefinitionList, KpiCard, Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db";
import { getNotes, listSets } from "@/lib/db/market";
import { getDataset } from "@/lib/jajiga/dataset";
import { priceChangesBetweenCaptures, roomPriceHistory } from "@/lib/market-trends";
import { toJalali } from "@/lib/dates";
import { formatNumber, formatPercent, formatToman } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "پرونده رقیب" };

export default async function CompetitorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const roomId = Number(id);
  if (!Number.isInteger(roomId)) notFound();

  const data = getDataset();
  const room = data.competitors.find((candidate) => candidate.id === roomId);
  if (!room) notFound();

  const db = getDb();
  const note = getNotes(db).get(roomId) ?? null;
  const memberOf = listSets(db).filter((set) => set.roomIds.includes(roomId));
  const rateSplit = data.rateSplits.get(roomId) ?? null;

  const history = roomPriceHistory(db, roomId);
  const changes = priceChangesBetweenCaptures(db).find((change) => change.roomId === roomId);

  const gapVsOwner =
    room.basePrice > 0 && data.owner.basePrice > 0
      ? (room.basePrice - data.owner.basePrice) / data.owner.basePrice
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={room.title}
        description={`${room.village} · ${room.propertyType} · شباهت ${formatPercent(
          room.similarity,
        )} به اقامتگاه شما${
          room.distanceKm !== null ? ` · فاصله ${formatNumber(room.distanceKm, 1)} کیلومتر` : ""
        }`}
        action={
          <div className="no-print flex items-center gap-2">
            <Link
              href="/competitors"
              className="rounded-xl bg-white/6 px-3 py-2 text-[11px] font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              ← همه رقبا
            </Link>
            <a
              href={room.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-white/6 px-3 py-2 text-[11px] font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              آگهی در جاجیگا ↗
            </a>
          </div>
        }
      />

      {memberOf.length ? (
        <div className="flex flex-wrap gap-1.5">
          {memberOf.map((set) => (
            <Chip key={set.id} tone="brand">
              عضو مجموعه «{set.name}»
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="نرخ پایه (کارت آگهی)"
          value={formatToman(room.basePrice)}
          hint={
            gapVsOwner !== null
              ? `${gapVsOwner >= 0 ? "+" : ""}${formatPercent(gapVsOwner)} نسبت به شما`
              : undefined
          }
          tone="brand"
        />
        <KpiCard
          label="نرخ واقعی تقویم"
          value={rateSplit?.weekday ? formatToman(rateSplit.weekday) : "—"}
          hint={
            rateSplit?.weekend
              ? `آخر هفته ${formatToman(rateSplit.weekend)}`
              : "این اتاق در رادار رصد نمی‌شود"
          }
        />
        <KpiCard
          label="امتیاز"
          value={room.rating !== null ? formatNumber(room.rating, 1) : "—"}
          hint={`${formatNumber(room.reviewsCount)} نظر · ${formatNumber(room.successBooks)} رزرو موفق`}
        />
        <KpiCard
          label="پر بودن ۳۰ شب آینده"
          value={room.occupancy30 !== null ? formatPercent(room.occupancy30) : "—"}
          hint={
            data.owner.occupancy30 !== null
              ? `شما: ${formatPercent(data.owner.occupancy30)}`
              : undefined
          }
        />
      </div>

      {changes ? (
        <Notice tone={Math.abs(changes.changePercent) >= 0.05 ? "warning" : "info"}>
          از برش قبلی آرشیو ({toJalali(changes.fromCapture)} ← {toJalali(changes.toCapture)})، میانه
          نرخ این رقیب {changes.changePercent >= 0 ? "افزایش" : "کاهش"}{" "}
          <strong className="num">{formatPercent(Math.abs(changes.changePercent))}</strong> داشته:{" "}
          {formatToman(changes.fromMedian)} ← {formatToman(changes.toMedian)}
        </Notice>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card
          title="تاریخچه نرخ در برش‌های آرشیو"
          subtitle="میانه نرخ شب‌های باز این اتاق در هر برش npm run archive"
        >
          {history.length >= 2 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px] text-right text-[12px]">
                <thead>
                  <tr className="border-b border-white/8 text-[11px] text-slate-500">
                    <th className="py-2 font-semibold">برش</th>
                    <th className="py-2 font-semibold">شب‌های ثبت‌شده</th>
                    <th className="py-2 font-semibold">میانه نرخ</th>
                    <th className="py-2 font-semibold">اشغال پنجره</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((point) => (
                    <tr key={point.capturedAt} className="border-b border-white/5 last:border-0">
                      <td className="num py-2 text-slate-300">{toJalali(point.capturedAt)}</td>
                      <td className="num py-2 text-slate-400">{formatNumber(point.nights)}</td>
                      <td className="num py-2 font-bold text-slate-100">
                        {point.medianPrice !== null ? formatToman(point.medianPrice) : "—"}
                      </td>
                      <td className="num py-2 text-slate-300">
                        {formatPercent(point.occupancy)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-[12px] leading-relaxed text-slate-500">
              {history.length === 1
                ? "فقط یک برش آرشیو ذخیره شده. بعد از رفرش بعدی دیتاست، npm run archive را اجرا کنید تا روند این رقیب ساخته شود."
                : "این اتاق در تقویم رادار رصد نمی‌شود، بنابراین تاریخچه قیمتی ندارد."}
            </p>
          )}
        </Card>

        <Card title="یادداشت و برچسب شما" subtitle="فقط برای خودتان ذخیره می‌شود.">
          <CompetitorNoteEditor roomId={roomId} initial={note} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="مشخصات">
          <DefinitionList
            items={[
              { term: "ظرفیت", value: `${formatNumber(room.capacity)} (تا ${formatNumber(room.maxCapacity)})` },
              { term: "اتاق خواب", value: formatNumber(room.bedrooms) },
              {
                term: "متراژ",
                value: room.floorArea ? `${formatNumber(room.floorArea)} متر` : "—",
              },
              {
                term: "حداقل اقامت",
                value: room.minStay ? `${formatNumber(room.minStay)} شب` : "—",
              },
              {
                term: "تخفیف فعال",
                value: room.currentDiscountPercent
                  ? formatPercent(room.currentDiscountPercent / 100)
                  : "ندارد",
              },
              { term: "تعداد امکانات", value: formatNumber(room.featuresCount) },
            ]}
          />
        </Card>

        <Card title="چرا این اتاق رقیب شماست؟">
          <ul className="space-y-2">
            {room.reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2 text-[12px] text-slate-300">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
                {reason}
              </li>
            ))}
          </ul>
          {room.featureLabels.length ? (
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/8 pt-3">
              {room.featureLabels.slice(0, 16).map((feature) => (
                <span
                  key={feature}
                  className="rounded bg-white/6 px-2 py-1 text-[10px] text-slate-400"
                >
                  {feature}
                </span>
              ))}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
