import Shell from "@/app/components/Shell";
import { requireVendor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { VSTATUS } from "@/lib/constants";
import BusinessDetailsForm from "./BusinessDetailsForm";

export default async function OnboardingForm() {
  const user = await requireVendor();
  const vendor = await prisma.vendor.findUnique({ where: { id: user.vendorId! } });
  if (!vendor) return null;

  const editable =
    vendor.status === VSTATUS.DRAFT ||
    vendor.status === VSTATUS.INVITED ||
    vendor.status === VSTATUS.CHANGES_REQUESTED;

  return (
    <Shell active="form" title="Business Details">
      <div className="page-head">
        <div>
          <h1>Business Details</h1>
          <p>Provide your company&apos;s registration, contact and banking information.</p>
        </div>
      </div>
      <div className="card card-pad">
        <BusinessDetailsForm vendor={vendor} editable={editable} />
      </div>
    </Shell>
  );
}
