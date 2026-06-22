import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../Header';

export default function GuestLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header />
      <main className="flex-1 w-full relative">
        <Outlet />
      </main>
    </div>
  );
}
