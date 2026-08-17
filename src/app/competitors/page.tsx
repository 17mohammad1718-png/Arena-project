import { CompetitorTable } from "@/components/competitor-table";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { loadDataset } from "@/lib/load-dataset";
import { formatNumber, rankCompetitors } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export const metadata = { title: "رقبا" };

export default function CompetitorsPage() {
  const dataset = loadDataset();
  const ranked = rankCompetitors(dataset.property, dataset.competitors);

  return (
    <div className="space-y-6">
      <PageHeader
        title="کاوش رقبا"
        description={`${formatNumber(
          ranked.length,
        )} اقامتگاه ثبت‌شده در بازار مرجع. با فیلتر و انتخاب چند مورد، مجموعه رقبای دلخواه خود را بسازید و مستقیماً با اقامتگاه خودتان مقایسه کنید.`}
      />

      <Notice>
        امتیاز «شباهت» ترکیبی است از ظرفیت، تعداد اتاق، فاصله جغرافیایی، نوع اقامتگاه و همپوشانی
        امکانات. هرچه این عدد بالاتر باشد، مقایسه قیمت معنادارتر است. رقیب با شباهت پایین را برای
        تصمیم قیمتی مبنا قرار ندهید.
      </Notice>

      {ranked.length ? (
        <CompetitorTable competitors={ranked} property={dataset.property} />
      ) : (
        <EmptyState
          title="هنوز رقیبی ثبت نشده است"
          description="فایل رقبا را با نام competitors.csv در پوشه data قرار دهید تا این صفحه با داده واقعی پر شود."
        />
      )}
    </div>
  );
}
