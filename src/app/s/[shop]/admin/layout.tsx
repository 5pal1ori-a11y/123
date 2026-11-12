export default function ShopAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{document.documentElement.classList.remove("light");document.documentElement.setAttribute("data-admin-theme","dark");localStorage.setItem("vendix-admin-theme","dark")}catch(e){}})();`,
        }}
      />
      {children}
    </>
  );
}
