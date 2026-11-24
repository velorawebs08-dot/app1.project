export const siteData = {
  instituteName: 'Patil Classes',
  tagline: 'Standard 10th Academic Excellence',
  logoUrl: 'https://i.postimg.cc/pVqdMhkw/image.png',
  standard: '10th' as const,
  academicYear: '2026–27',
  colors: {
    navy: '#0F2A4A',
    amber: '#F5A623',
  },
  subjects: [
    'Maths',
    'Science',
    'English',
    'Marathi',
    'Hindi',
    'Social Science',
  ] as const,
};

export type SubjectName = (typeof siteData.subjects)[number];
