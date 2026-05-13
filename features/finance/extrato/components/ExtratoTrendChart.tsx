import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export const ExtratoTrendChart = ({ data }: { data: any[] }) => {
    // Transform data for the chart if needed, or assume it's already formatted
    // For now, let's create a dummy trend based on the DRE if the data is empty
    const chartData = data.length > 0 ? data : [
        { name: 'Sem 1', revenue: 4000, expense: 2400 },
        { name: 'Sem 2', revenue: 3000, expense: 1398 },
        { name: 'Sem 3', revenue: 2000, expense: 9800 },
        { name: 'Sem 4', revenue: 2780, expense: 3908 },
    ];

    return (
        <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                    <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} 
                        dy={10}
                    />
                    <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
                    />
                    <Tooltip 
                        cursor={{ fill: '#1e293b', opacity: 0.4 }}
                        contentStyle={{ 
                            backgroundColor: '#0f172a', 
                            border: '1px solid #1e293b', 
                            borderRadius: '12px',
                            fontSize: '10px',
                            fontWeight: 900,
                            textTransform: 'uppercase'
                        }}
                    />
                    <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
