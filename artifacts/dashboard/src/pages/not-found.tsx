import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex w-full items-center justify-center p-8 mt-12">
      <Card className="w-full max-w-md border-border bg-card">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h1 className="text-2xl font-bold font-mono tracking-tight text-foreground">
              404
            </h1>
            <p className="text-sm text-muted-foreground">
              Trang bạn tìm kiếm không tồn tại hoặc đã bị di chuyển.
            </p>
            <Button asChild className="mt-4 font-mono text-xs uppercase" variant="outline">
              <Link href="/">Về Trang Chủ</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
