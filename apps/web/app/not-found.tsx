import { Button } from "@lane4hq/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@lane4hq/ui/components/empty";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-6xl items-center px-4">
      <Empty className="w-full">
        <EmptyHeader>
          <EmptyTitle>This page does not exist.</EmptyTitle>
          <EmptyDescription>
            That address is not a page on this site. Go home, or open the
            product overview.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              className="press-scale"
              render={<Link href="/" />}
              nativeButton={false}
            >
              Home
            </Button>
            <Button
              variant="outline"
              className="press-scale"
              render={<Link href="/product" />}
              nativeButton={false}
            >
              Product
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
