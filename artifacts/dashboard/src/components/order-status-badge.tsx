import { OrderStatus } from "@workspace/api-client-react";
import { Badge } from "./ui/badge";

export function OrderStatusBadge({ status }: { status: string }) {
  let variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" = "default";
  
  switch (status) {
    case "pending":
      variant = "warning";
      break;
    case "processing":
      variant = "info";
      break;
    case "fulfilled":
      variant = "success";
      break;
    case "failed":
      variant = "destructive";
      break;
  }
  
  const statusLabels: Record<string, string> = {
    pending: "Chờ Xử Lý",
    processing: "Đang Xử Lý",
    fulfilled: "Hoàn Thành",
    failed: "Thất Bại",
  };

  return (
    <Badge variant={variant} className="uppercase font-mono tracking-wide text-[10px]">
      {statusLabels[status] ?? status}
    </Badge>
  );
}
