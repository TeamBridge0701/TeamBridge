package com.groupware.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.NoticeDTO;

@Mapper
public interface NoticeMapper {

	// 공지 목록 조회 - 제목/본문 검색 + 고정글 우선 정렬 + 페이징(10건 단위)
	List<NoticeDTO> findNotices(@Param("keyword") String keyword, @Param("offset") int offset,
			@Param("size") int size);

	// 목록 페이징 UI(전체 페이지 수 계산)에 필요한 검색 결과 총 건수
	int countNotices(@Param("keyword") String keyword);

	// 공지 상세 조회 (목록과 동일하게 작성자 이름/부서명 조인)
	NoticeDTO findNoticeDetail(@Param("noticeId") int noticeId);

	// 조회수 원자적 증가 - 화면에서 count++ 하지 않고 DB에서 직접 +1 (동시 조회에도 정확)
	int incrementViewCount(@Param("noticeId") int noticeId);

	// 수정 모달 프리필용 - findNoticeDetail과 달리 조회수를 올리지 않는다
	NoticeDTO findNoticeForEdit(@Param("noticeId") int noticeId);

	// 신규 등록 - NOTICE_ID는 AUTO_INCREMENT라 클라이언트가 만들지 않음
	int insertNotice(@Param("writerId") int writerId, @Param("noticeTitle") String noticeTitle,
			@Param("noticeContent") String noticeContent, @Param("isPinned") boolean isPinned);

	// 수정 - 작성자는 바뀌지 않으므로 제목/본문/고정여부만 갱신
	int updateNotice(@Param("noticeId") int noticeId, @Param("noticeTitle") String noticeTitle,
			@Param("noticeContent") String noticeContent, @Param("isPinned") boolean isPinned);

	// 삭제 - NOTICE 테이블엔 소프트 삭제용 컬럼이 없어 실제 DELETE로 처리
	int deleteNotice(@Param("noticeId") int noticeId);
}
