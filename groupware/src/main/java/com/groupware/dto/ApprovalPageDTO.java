package com.groupware.dto;

import java.util.List;

import lombok.Data;

// 받은/보낸/참조 문서함 fetch 응답을 감싸는 페이징 결과. 자료실(ArchiveService)의
// currentPage/totalPages/groupStart/groupEnd 계산을 그대로 쓰되, 전자결재는 화면 이동이
// 아니라 fetch로 탭을 그리는 구조라 이 값들을 JSON으로 같이 내려줘야 approval.js가
// 페이지 번호 버튼을 그릴 수 있다. DB 테이블이 아니라 응답 전용 포장 객체.
@Data
public class ApprovalPageDTO {
	private List<ApprovalDTO> content;
	private int currentPage;
	private int totalPages;
	private int groupStart;
	private int groupEnd;
	// 대시보드 위젯("결재 대기 문서 N건")처럼 페이지로 안 잘린 진짜 전체 건수가 필요한 곳에서 사용
	private int totalCount;
}
