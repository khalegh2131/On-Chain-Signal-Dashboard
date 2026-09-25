import { AppFooter } from '@/components/shared/app-footer';
import { AppSidebar } from '@/components/shared/app-sidebar';
import { TopBar } from '@/components/shared/top-bar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />

        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10 sm:px-8 lg:px-10 lg:py-14">
          {children}
        </main>

        <AppFooter />
      </div>
    </div>
  );
}
