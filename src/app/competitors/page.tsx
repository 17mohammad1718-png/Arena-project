import { CompetitorTable } from "@/components/competitor-table";
import { Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db";
import { getNotes, listSets } from "@/lib/db/market";
import { getDataset } from "@/lib/jajiga/dataset";
import { formatNumber } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "رقبا" };

export default function CompetitorsPage() {
  const data = getDataset();

  if (data.isEmpty) {
    return <Notice tone="warning">فهرست رقبا در دسترس نیست.</Notice>;
  }

  const db = getDb();
  const sets = listSets(db);
  const notes = [...getNotes(db).values()];

  return (
    <div className="space-y-6">
      <PageHeader
        title="اقامتگاه‌های رقیب"
        description={`${formatNumber(
          data.competitors.length,
        )} اقامتگاه فعال در بابلکنار، مرتب‌شده بر پایه شباهت واقعی به اقامتگاه شما.`}
      />

      <Notice>
        امتیاز شباهت از ترکیب <strong>ظرفیت، تعداد اتاق، فاصله جغرافیایی واقعی، نوع اقامتگاه،
        هم‌پوشانی امکانات و داشتن استخر یا جکوزی</strong> ساخته می‌شود. برچسب‌های زیر هر نام دلیل
        انتخاب آن رقیب را نشان می‌دهند. نرخ‌ها «نرخ پایه از» هستند.
      </Notice>

      <CompetitorTable
        competitors={data.competitors}
        owner={data.owner}
        sets={sets}
        notes={notes}
      />
    </div>
  );
}
