import { useParams, Link } from "wouter";
import { 
  useGetOrder, 
  useRetryOrder, 
  useFulfillOrder, 
  getGetOrderQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const fulfillSchema = z.object({
  productDetails: z.string().min(1, "Product details are required"),
});

type FulfillFormValues = z.infer<typeof fulfillSchema>;

export default function OrderDetails() {
  const params = useParams();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const [isFulfilling, setIsFulfilling] = useState(false);

  const { data: order, isLoading, error } = useGetOrder(id, {
    query: {
      enabled: !isNaN(id),
      queryKey: getGetOrderQueryKey(id),
    }
  });

  const retryOrder = useRetryOrder();
  const fulfillOrder = useFulfillOrder();

  const form = useForm<FulfillFormValues>({
    resolver: zodResolver(fulfillSchema),
    defaultValues: {
      productDetails: "",
    },
  });

  if (isNaN(id)) {
    return <div className="text-destructive font-mono">Mã đơn hàng không hợp lệ</div>;
  }

  if (isLoading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-8 bg-muted w-1/4 rounded"></div>
      <div className="h-64 bg-muted rounded"></div>
    </div>;
  }

  if (error || !order) {
    return <div className="text-destructive font-mono p-4 bg-destructive/10 rounded-md border border-destructive/20">Không thể tải đơn hàng. Đơn này có thể không tồn tại.</div>;
  }

  const handleRetry = () => {
    retryOrder.mutate({ id }, {
      onSuccess: (updatedOrder) => {
        queryClient.setQueryData(getGetOrderQueryKey(id), updatedOrder);
      }
    });
  };

  const onFulfillSubmit = (values: FulfillFormValues) => {
    fulfillOrder.mutate({ id, data: { productDetails: values.productDetails } }, {
      onSuccess: (updatedOrder) => {
        queryClient.setQueryData(getGetOrderQueryKey(id), updatedOrder);
        setIsFulfilling(false);
        form.reset();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="shrink-0">
          <Link href="/orders">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono mb-1">Đơn #{order.id}</h1>
          <p className="text-muted-foreground text-sm">Chi tiết và nội dung tin nhắn gốc.</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <OrderStatusBadge status={order.status} />
          {order.status === "failed" && (
            <Button 
              onClick={handleRetry} 
              disabled={retryOrder.isPending}
              variant="outline"
              className="gap-2 font-mono text-xs uppercase"
            >
              <RefreshCw className={`h-4 w-4 ${retryOrder.isPending ? "animate-spin" : ""}`} />
              Thử Lại
            </Button>
          )}
          {(order.status === "pending" || order.status === "failed" || order.status === "processing") && !isFulfilling && (
            <Button 
              onClick={() => setIsFulfilling(true)} 
              variant="default"
              className="gap-2 font-mono text-xs uppercase"
            >
              <CheckCircle className="h-4 w-4" />
              Giao Thủ Công
            </Button>
          )}
        </div>
      </div>

      {isFulfilling && (
        <Card className="border-primary bg-primary/5">
          <CardHeader>
            <CardTitle>Giao Hàng Thủ Công</CardTitle>
            <CardDescription>Nhập thông tin sản phẩm để gửi cho khách hàng.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onFulfillSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="productDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nội Dung Sản Phẩm</FormLabel>
                      <FormControl>
                        <Input placeholder="VD: KEY-ABCD-1234-WXYZ hoặc nội dung giao cho khách" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setIsFulfilling(false)}>Hủy</Button>
                  <Button type="submit" disabled={fulfillOrder.isPending}>
                    {fulfillOrder.isPending ? "Đang gửi..." : "Giao Hàng"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {order.status === "failed" && order.errorMessage && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <CardTitle>Chi Tiết Lỗi</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-card p-4 rounded-md border text-destructive">
              {order.errorMessage}
            </pre>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm uppercase font-mono text-muted-foreground tracking-wider">Thông Tin Khách</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground font-mono mb-1">ID Telegram</div>
              <div className="font-mono text-sm bg-muted p-2 rounded">{order.customerId}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-mono mb-1">Tên Đăng Nhập</div>
              <div className="font-medium">{order.customerUsername ? `@${order.customerUsername}` : "Không có"}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm uppercase font-mono text-muted-foreground tracking-wider">Thông Tin Đơn</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground font-mono mb-1">Loại Sản Phẩm</div>
              <div className="font-medium bg-muted p-2 rounded">{order.productType}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground font-mono mb-1">Thời Gian Tạo</div>
                <div className="font-mono text-xs">{formatDate(order.createdAt)}</div>
              </div>
              {order.fulfilledAt && (
                <div>
                  <div className="text-xs text-muted-foreground font-mono mb-1">Hoàn Thành Lúc</div>
                  <div className="font-mono text-xs text-success">{formatDate(order.fulfilledAt)}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm uppercase font-mono text-muted-foreground tracking-wider">Tin Nhắn Gốc Từ Khách</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-[#0f172a] text-[#f8fafc] p-4 rounded-md border">
              {order.rawMessage}
            </pre>
          </CardContent>
        </Card>

        {order.sourceApiResponse && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm uppercase font-mono text-muted-foreground tracking-wider">Phản Hồi Từ API Nguồn Hàng</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-card p-4 rounded-md border text-muted-foreground">
                {order.sourceApiResponse}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
